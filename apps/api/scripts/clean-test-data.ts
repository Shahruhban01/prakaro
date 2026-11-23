import { prisma } from '../src/common/database/prisma';

async function main() {
  console.log('Cleaning synthetic test data from database...');

  // Reset daily intake limit counter
  await prisma.moderationCounter.updateMany({
    where: { key: { startsWith: 'cases:' } },
    data: { count: 0 },
  });

  const orgs = await prisma.organization.findMany({
    where: { code: { not: 'PRAKARO_CORE_OPS' } },
  });
  const orgIds = orgs.map((o) => o.id);

  await prisma.caseHandlingRecord.deleteMany();
  await prisma.moderationCaseReservation.deleteMany();
  await prisma.moderationDecisionVersion.deleteMany();
  await prisma.moderationSubmission.deleteMany();
  await prisma.moderationTask.deleteMany();
  await prisma.moderationWorkSession.deleteMany();
  await prisma.moderationAudit.deleteMany();
  await prisma.moderationCase.deleteMany();
  await prisma.searchAdmission.deleteMany();
  await prisma.parkingIntelligenceCase.deleteMany();

  await prisma.auxTransitionAudit.deleteMany();
  await prisma.auxInterval.deleteMany();
  await prisma.attendanceSession.deleteMany();

  await prisma.queueSubscription.deleteMany();
  await prisma.queueConfigurationVersion.deleteMany();
  await prisma.queueLobAccess.deleteMany();
  await prisma.moderationMembership.deleteMany();
  await prisma.moderationQueue.deleteMany({ where: { organizationId: { in: orgIds } } });

  await prisma.workforceTeamLink.deleteMany();
  await prisma.workforceTeam.deleteMany({ where: { organizationId: { in: orgIds } } });

  await prisma.moderatorAccount.deleteMany({ where: { user: { organizationId: { in: orgIds } } } });
  await prisma.moderatorSession.deleteMany({ where: { user: { organizationId: { in: orgIds } } } });
  await prisma.moderator.deleteMany({ where: { organizationId: { in: orgIds } } });

  await prisma.lob.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });

  console.log(`Successfully removed ${orgIds.length} synthetic test organizations and related records.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
