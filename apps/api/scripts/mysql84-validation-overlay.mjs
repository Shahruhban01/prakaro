import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import console from 'node:console';

const original = fileURLToPath(new URL('../prisma/', import.meta.url));
const overlay = mkdtempSync(join(tmpdir(), 'prakaro-mysql84-validation-'));
cpSync(original, overlay, { recursive: true });

// Disposable validation only. The checked-in Prisma migration history is authoritative.
for (const entry of readdirSync(join(overlay, 'migrations'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = join(overlay, 'migrations', entry.name, 'migration.sql');
  const sql = readFileSync(file, 'utf8');
  const cascading = new Map();
  const foreignKey = /ALTER TABLE \x60(\w+)\x60 ADD CONSTRAINT \x60\w+\x60 FOREIGN KEY \(([^)]+)\)[^;]+?ON DELETE (CASCADE|SET NULL|RESTRICT|NO ACTION) ON UPDATE (CASCADE|SET NULL|RESTRICT|NO ACTION);/gi;
  for (const [, table, columns, onDelete, onUpdate] of sql.matchAll(foreignKey)) {
    if (![onDelete, onUpdate].some((action) => ['CASCADE', 'SET NULL'].includes(action.toUpperCase()))) continue;
    const existing = cascading.get(table) ?? new Set();
    for (const [, column] of columns.matchAll(/\x60(\w+)\x60/g)) existing.add(column);
    cascading.set(table, existing);
  }
  const migrated = sql.replace(
    /ALTER TABLE \x60(\w+)\x60 ADD CONSTRAINT \x60(\w+)\x60 CHECK \(([\s\S]+?)\);/g,
    (statement, table, name, expression) => {
      const columns = [...expression.matchAll(/\x60(\w+)\x60/g)].map((match) => match[1]);
      if (!columns.some((column) => cascading.get(table)?.has(column))) return statement;
      const predicate = expression.replace(/\x60(\w+)\x60/g, 'NEW.$&');
      console.error(entry.name + ' ' + name + ' represented by isolated test triggers');
      // A false predicate violates the non-null primary key. NULL is permitted,
      // matching SQL CHECK's three-valued logic. Cascaded updates skip triggers.
      return ['INSERT', 'UPDATE'].map((op) =>
        'CREATE TRIGGER ' + name + (op === 'INSERT' ? '_bi' : '_bu') +
        ' BEFORE ' + op + ' ON ' + table + ' FOR EACH ROW\n' +
        '  SET NEW.id = IF((' + predicate + ') IS FALSE, NULL, NEW.id);',
      ).join('\n');
    },
  );
  writeFileSync(file, migrated, 'utf8');
}
console.log(join(overlay, 'schema.prisma'));
