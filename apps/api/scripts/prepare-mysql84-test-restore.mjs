import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';

const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error('Pass a synthetic backup and a new output filename.');
const raw = readFileSync(source, 'utf8');
if (!raw.includes('phase10-backup-sentinel')) throw new Error('The synthetic recovery sentinel is missing.');
const trigger = /^(\/\*!50003 CREATE\*\/ \/\*!50017 DEFINER=[^\r\n]+?\*\/ \/\*!50003 TRIGGER [\s\S]+?);(?= \*\/;;\r?$)/gm;
let count = 0;
const normalized = raw.replace(trigger, (_match, definition) => { count += 1; return definition; });
if (!count) throw new Error('The synthetic backup does not contain the affected trigger export form.');
writeFileSync(output, normalized, { flag: 'wx' });
console.log(JSON.stringify({ normalizedTriggerTerminators: count }));
