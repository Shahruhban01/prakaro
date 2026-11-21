import { readFile, stat } from 'node:fs/promises';
import { prisma } from '../../common/database/prisma';
import { ParkingReviewService } from './intelligence.review';

async function readInput(file: string): Promise<unknown> {
  if ((await stat(file)).size > 64_000) throw new Error('Input exceeds 64 KB.');
  return JSON.parse(await readFile(file, 'utf8')) as unknown;
}

async function main() {
  const [command, first, second, ...extra] = process.argv.slice(2);
  const review = await ParkingReviewService.open(process.env.PARKING_REVIEW_TOKEN);
  let result: unknown;
  if (command === 'inspect' && first && !second) result = await review.inspect(first);
  else if (command === 'import' && first && !second)
    result = await review.createCase(await readInput(first));
  else if (command === 'record' && first && second && !extra.length)
    result = await review.record(first, await readInput(second));
  else if (command === 'evidence' && first && second && !extra.length)
    result = await review.reviseEvidence(first, await readInput(second));
  else throw new Error('Invalid review command.');
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch(() => {
    console.error(
      'Review command failed. Check authorization, evidence, revision and command syntax.',
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
