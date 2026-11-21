import { readFile, stat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { prisma } from '../../common/database/prisma';
import { env } from '../../config/env';
import { PROMPT_VERSION } from './intelligence.gemini';
import { evaluateMetrics } from './intelligence.metrics';
import { decideParking, POLICY_VERSION, reviewDecision } from './intelligence.policy';
import { comparePolicyMetrics, type PolicyEvaluationRow } from './intelligence.policy-metrics';
import { evaluateRules, RULES_VERSION } from './intelligence.rules';
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
            id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
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
              'CLOSED_PARKING',
            ]),
            observations: z.array(evidenceSchema.omit({ id: true }).extend({ reference })).max(12),
            priorReview: z
              .object({
                reviewedOn: z.string().date(),
                expiresOn: z.string().date(),
                decision: reviewDecision,
                evidenceReferences: z.array(reference).max(12),
              })
              .strict()
              .optional(),
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
          .superRefine(({ review, priorReview, observations }, context) => {
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
            if (
              priorReview &&
              (priorReview.reviewedOn >= review.reviewedOn ||
                priorReview.expiresOn <= priorReview.reviewedOn ||
                priorReview.evidenceReferences.some(
                  (item) => !observations.some(({ reference }) => reference === item),
                ))
            ) {
              context.addIssue({
                code: 'custom',
                message: 'Prior review must predate ground truth and cite observation evidence',
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
      'as-of': { type: 'string' },
      'input-usd-per-million': { type: 'string' },
      'output-usd-per-million': { type: 'string' },
    },
    allowPositionals: true,
  });
  const [file] = positionals;
  if (!file || positionals.length !== 1) throw new Error('Provide one reviewed dataset JSON path.');
  if ((await stat(file)).size > 2_000_000) throw new Error('Reviewed dataset exceeds 2 MB.');
  const metadata = await readFile(file);
  const evaluationDate = z
    .string()
    .date()
    .parse(values['as-of'] ?? new Date().toISOString().slice(0, 10));
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
  const rows: PolicyEvaluationRow[] = [];
  for (const entry of parsed.data.cases) {
    if (entry.review.reviewedOn > evaluationDate)
      throw new Error('Ground truth review is after the evaluation date.');
    const evidence = entry.observations.map(({ source, finding }, index) => ({
      source,
      finding,
      id: `E${index + 1}`,
    }));
    const previous = entry.priorReview;
    const cited = evidence.filter((_, index) =>
      previous?.evidenceReferences.includes(entry.observations[index]?.reference ?? ''),
    );
    const citedRules = evaluateRules(cited);
    const priorMatches =
      previous?.decision === 'CONFIRM_PARKING'
        ? citedRules.classification === 'LIKELY_PARKING'
        : previous?.decision === 'CONFIRM_NON_PARKING'
          ? citedRules.classification === 'LIKELY_NOT_PARKING'
          : true;
    const review =
      previous && priorMatches && previous.expiresOn > evaluationDate
        ? previous.decision
        : previous
          ? 'STALE'
          : undefined;
    const verification = await service.verify({ evidence });
    rows.push({
      id: entry.id,
      scenario: entry.scenario,
      truth: entry.review.classification,
      truthAccess: entry.review.access,
      verification,
      decision: decideParking({
        evidence,
        rules: verification.baseline,
        assessment:
          verification.status === 'EVALUATED' ? verification.assessment?.classification : undefined,
        review,
        requireHumanReview: env.PARKING_INTELLIGENCE_REQUIRE_HUMAN_REVIEW,
      }),
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
    evaluationDate,
    model: env.GEMINI_MODEL,
    promptVersion: PROMPT_VERSION,
    rulesVersion: RULES_VERSION,
    policyVersion: POLICY_VERSION,
    requireHumanReview: env.PARKING_INTELLIGENCE_REQUIRE_HUMAN_REVIEW,
    labelDistribution: Object.fromEntries(
      classification.options.map((label) => [
        label,
        rows.filter(({ truth }) => truth === label).length,
      ]),
    ),
    ...evaluated,
    comparisons: comparePolicyMetrics(rows),
  };
  if (values.persist) {
    const version = await getVersion();
    await prisma.parkingEvaluationMetrics.create({
      data: {
        versionId: version.id,
        datasetVersion: parsed.data.version,
        metrics: JSON.parse(
          JSON.stringify(metrics, (key, value: unknown) =>
            key === 'examples' ? undefined : value,
          ),
        ),
      },
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
