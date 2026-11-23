import { prisma } from '../../common/database/prisma';
import { audit } from './intake';
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
