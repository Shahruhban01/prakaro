import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { prisma } from '../../common/database/prisma';
import { env } from '../../config/env';
import { PROMPT_VERSION } from './intelligence.gemini';
import { evaluateMetrics, type EvaluationRow } from './intelligence.metrics';
import { access, pricing, classification, evidenceSchema } from './intelligence.schemas';
import { createIntelligenceService, getVersion } from './intelligence.store';

const reference = z.string().trim().min(1).max(500);
const dataset = z
  .object({
    version: z.string().trim().min(1).max(100),
    cases: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(100),
            scenario: z.enum([
              'PUBLIC_PARKING',
              'PAID_PARKING',
              'FREE_PARKING',
              'PRIVATE_PARKING',
              'CUSTOMER_ONLY',
              'VEHICLE_REPAIR',
              'TRANSPORT_COMPANY',
              'INCORRECT_CATEGORY',
              'DUPLICATE',
              'UNCERTAIN',
            ]),
            observations: z.array(evidenceSchema.omit({ id: true }).extend({ reference })).max(12),
            review: z
              .object({
                reviewedOn: z.string().date(),
                classification,
                access,
                pricing,
                evidenceReferences: z.array(reference).max(20),
                pricingEvidence: reference.nullable(),
                decision: z.enum(['CONFIRMED', 'ABSTAINED']),
                notes: z.string().trim().min(1).max(2000),
              })
              .strict(),
          })
          .strict()
          .superRefine(({ review }, context) => {
            const confirmed =
              review.classification === 'LIKELY_PARKING' ||
              review.classification === 'LIKELY_NOT_PARKING';
            if (
              (review.decision === 'CONFIRMED') !== confirmed ||
              (confirmed && review.evidenceReferences.length === 0) ||
              (review.pricing !== 'UNKNOWN' && !review.pricingEvidence)
            ) {
              context.addIssue({
                code: 'custom',
                message: 'Inconsistent reviewer decision or missing sources',
              });
            }
          }),
      )
      .max(200)
      .refine((cases) => new Set(cases.map(({ id }) => id)).size === cases.length),
  })
  .strict();

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      gemini: { type: 'boolean' },
      persist: { type: 'boolean' },
      'input-usd-per-million': { type: 'string' },
      'output-usd-per-million': { type: 'string' },
    },
    allowPositionals: true,
  });
  const [file] = positionals;
  if (!file || positionals.length !== 1) throw new Error('Provide one reviewed dataset JSON path.');
  const metadata = await readFile(file);
  if (metadata.length > 2_000_000) throw new Error('Reviewed dataset exceeds 2 MB.');
  const parsed = dataset.safeParse(JSON.parse(metadata.toString('utf8')));
  if (!parsed.success) {
    const locations = parsed.error.issues.map((issue) => issue.path.join('.') || 'dataset');
    throw new Error(`Invalid reviewed dataset at ${[...new Set(locations)].join(', ')}.`);
  }
  if (
    values.gemini &&
    (!env.AI_VERIFICATION_ENABLED || !env.AI_SHADOW_MODE || !env.GEMINI_API_KEY)
  ) {
    throw new Error('Live evaluation requires a Gemini key and both AI flags set to true.');
  }
  const rateValues = [values['input-usd-per-million'], values['output-usd-per-million']];
  const ratesSchema = z.tuple([
    z.coerce.number().finite().nonnegative(),
    z.coerce.number().finite().nonnegative(),
  ]);
  const rates = rateValues.some((rate) => rate !== undefined)
    ? ratesSchema.safeParse(rateValues.map((rate) => rate?.trim() || undefined))
    : undefined;
  if (rates && !rates.success)
    throw new Error('Supply both nonnegative USD rates per million tokens.');

  const service = createIntelligenceService(values.gemini === true);
  const rows: EvaluationRow[] = [];
  for (const entry of parsed.data.cases) {
    const evidence = entry.observations.map(({ source, finding }, index) => ({
      source,
      finding,
      id: `E${index + 1}`,
    }));
    rows.push({
      truth: entry.review.classification,
      verification: await service.verify({ evidence }),
    });
  }
  const evaluated = evaluateMetrics(
    rows,
    rates?.success
      ? {
          inputUsdPerMillion: rates.data[0],
          outputUsdPerMillion: rates.data[1],
        }
      : undefined,
  );
  const metrics = {
    datasetVersion: parsed.data.version,
    model: env.GEMINI_MODEL,
    promptVersion: PROMPT_VERSION,
    ...evaluated,
  };
  if (values.persist) {
    const version = await getVersion();
    await prisma.parkingEvaluationMetrics.create({
      data: { versionId: version.id, datasetVersion: parsed.data.version, metrics },
    });
  }
  console.log(JSON.stringify(metrics, null, 2));
}

main()
  .catch(() => {
    // File parse and database errors can include source content or connection strings.
    console.error('Parking evaluation failed. Check the dataset format, flags and database setup.');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
