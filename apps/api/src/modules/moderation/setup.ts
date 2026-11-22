import { prisma } from '../../common/database/prisma';
import { audit, increment } from './intake';
import { defaultConfig, queueInput } from './config';
import { hashPassword } from 'better-auth/crypto';

export async function initialize(email: string, password?: string, name?: string) {
  return prisma.$transaction(
    async (tx) => {
      let superAdmin = await tx.superAdmin.findUnique({ where: { email } });
      const existingSuperAdmin = await tx.superAdmin.findFirst({ where: { status: 'ACTIVE' } });

      if (existingSuperAdmin && superAdmin && existingSuperAdmin.id !== superAdmin.id) {
        throw new Error('Super administrator already exists');
      }

      if (!superAdmin) {
        superAdmin = await tx.superAdmin.create({
          data: {
            name: name ?? (email.split('@')[0] || 'Super Admin'),
            email,
            status: 'ACTIVE',
            emailVerified: true,
          },
        });

        if (password) {
          const hashedPassword = await hashPassword(password);
          await tx.superAdminAccount.create({
            data: {
              userId: superAdmin.id,
              accountId: superAdmin.id,
              providerId: 'credential',
              password: hashedPassword,
            },
          });
        }
      }

      const templates = [
        ['GENERAL', 'General parking verification', 'source', 'SEARCH'],
        ['AI', 'AI recommended human review', 'ai', 'REVIEW_REQUIRED'],
        ['ACCESS', 'Restricted access review', 'access', 'RESTRICTED'],
        ['REPORT', 'User reports', 'source', 'REPORT'],
        ['REVERIFY', 'Reverification', 'source', 'EXPIRY'],
        ['ESCALATION', 'Escalations', 'source', 'ESCALATION'],
        ['QA', 'Quality assurance', 'source', 'QA'],
      ];

      for (const [kind, qName, field, value] of templates) {
        if (await tx.moderationQueue.findFirst({ where: { kind } })) continue;
        const input = queueInput.parse({
          kind,
          name: qName,
          priority: 0,
          capacity: 500,
          config: { ...defaultConfig, rule: { field, value } },
        });
        const seq = await increment(tx, 'queue-sequence');
        const q = await tx.moderationQueue.create({
          data: {
            ...input,
            code: 'QUEUE-' + kind + '-' + String(seq).padStart(3, '0'),
            createdBy: superAdmin.id,
          },
        });
        await audit(tx, superAdmin.id, 'QUEUE_CREATED', q.id, input, undefined, 'SUPER_ADMIN', superAdmin.id);
      }

      if (!existingSuperAdmin) {
        await audit(tx, superAdmin.id, 'STAFF_BOOTSTRAPPED', superAdmin.id, { role: 'SUPER_ADMIN' }, undefined, 'SUPER_ADMIN', superAdmin.id);
      }
      return superAdmin;
    },
    { isolationLevel: 'Serializable' },
  );
}

if (require.main === module) {
  initialize(process.argv[2] ?? '')
    .catch(() => {
      console.error('Initialization failed. Supply an existing Super Admin email.');
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
