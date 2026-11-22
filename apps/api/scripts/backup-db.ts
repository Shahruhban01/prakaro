import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/common/database/prisma';

async function backup() {
  const backupDir = path.resolve(__dirname, '../../../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `prakaro_db_backup_${timestamp}.json`);

  console.log('Starting full database backup...');
  const data = {
    timestamp: new Date().toISOString(),
    users: await prisma.user.findMany(),
    sessions: await prisma.session.findMany(),
    accounts: await prisma.account.findMany(),
    verifications: await prisma.verification.findMany(),
    savedParkings: await prisma.savedParking.findMany(),
    recentSearches: await prisma.recentSearch.findMany(),
    userPreferences: await prisma.userPreference.findMany(),
    moderationStaff: await prisma.moderationStaff.findMany({ include: { memberships: true } }),
    moderationQueues: await prisma.moderationQueue.findMany(),
    moderationMemberships: await prisma.moderationMembership.findMany(),
    moderationCases: await prisma.moderationCase.findMany(),
    moderationTasks: await prisma.moderationTask.findMany(),
    moderationSubmissions: await prisma.moderationSubmission.findMany(),
    moderationAudits: await prisma.moderationAudit.findMany(),
    searchAdmissions: await prisma.searchAdmission.findMany(),
    parkingIntelligenceCases: await prisma.parkingIntelligenceCase.findMany(),
    parkingEvidenceReferences: await prisma.parkingEvidenceReference.findMany(),
    parkingHumanLabels: await prisma.parkingHumanLabel.findMany(),
  };

  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Backup completed successfully: ${backupFile}`);
  console.log(
    `Summary: ${data.users.length} users, ${data.moderationStaff.length} moderation staff, ${data.moderationCases.length} cases, ${data.moderationQueues.length} queues.`,
  );

  await prisma.$disconnect();
}

backup().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
