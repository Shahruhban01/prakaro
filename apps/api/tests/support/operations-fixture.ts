import type { PrismaClient } from '@prisma/client';
import { createQaFixture } from './qa-fixture';

export async function createOperationsFixture(db: PrismaClient) {
  const fixture = await createQaFixture(db);
  const team = await db.workforceTeam.create({ data: {
    organizationId: fixture.org.id, code: 'OPS-' + fixture.org.code.slice(-8), name: 'Parking operations team',
    kind: 'MODERATION',
  } });
  await db.workforceTeamLink.createMany({ data: [
    { organizationId: fixture.org.id, teamId: team.id, moderatorId: fixture.moderator.id, kind: 'MEMBER' },
    { organizationId: fixture.org.id, teamId: team.id, moderatorId: fixture.supervisor.id, kind: 'SUPERVISOR' },
  ] });
  async function seedIntake(date: string) {
    await Promise.all(Array.from({ length: 6 }, async (_, index) => {
      const row = await fixture.createCase('Intake ' + index);
      await db.moderationCase.update({ where: { id: row.item.id }, data: {
        status: 'CLOSED', activeKey: null,
        createdAt: new Date(Date.parse(date + 'T08:00:00Z') - (index + 1) * 7 * 86400000),
      } });
    }));
  }
  return { ...fixture, team, seedIntake };
}
