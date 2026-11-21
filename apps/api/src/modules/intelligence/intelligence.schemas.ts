import { z } from 'zod';

export const classification = z.enum([
  'LIKELY_PARKING',
  'LIKELY_NOT_PARKING',
  'UNCERTAIN',
  'INSUFFICIENT_EVIDENCE',
]);
export const access = z.enum(['PUBLIC', 'PRIVATE', 'CUSTOMERS_ONLY', 'RESTRICTED', 'UNKNOWN']);
export const pricing = z.enum(['FREE', 'PAID', 'UNKNOWN']);
export const operatingInformation = z.enum([
  'PUBLISHED_HOURS_AVAILABLE',
  'NO_PUBLISHED_HOURS',
  'UNKNOWN',
]);

export const source = z.enum(['PRAKARO_AUDIT', 'PARKING_OPERATOR', 'PUBLIC_AUTHORITY']);
export const evidenceSchema = z
  .object({
    id: z.string().regex(/^E(?:[1-9]|1[0-2])$/),
    source,
    finding: z.enum([
      'CONFIRMED_PARKING',
      'CONFIRMED_NON_PARKING',
      'MARKED_PARKING_BAYS',
      'DEDICATED_PARKING_ENTRANCE',
      'NON_PARKING_BUSINESS_ON_SITE',
      'NO_PARKING_FOUND_ON_SITE',
      'PUBLIC_ACCESS',
      'PRIVATE_ACCESS',
      'CUSTOMERS_ONLY_ACCESS',
      'RESTRICTED_ACCESS',
      'FREE_PARKING',
      'PAID_PARKING',
      'PUBLISHED_HOURS',
      'NO_PUBLISHED_HOURS',
    ]),
  })
  .strict();

export const aiInputSchema = z
  .object({
    evidence: z
      .array(evidenceSchema)
      .min(1)
      .max(12)
      .refine(
        (items) => new Set(items.map(({ id }) => id)).size === items.length,
        'Evidence IDs must be unique',
      ),
  })
  .strict();

const reason = z.enum([
  'Supplied evidence supports a parking facility.',
  'Supplied evidence supports a non-parking listing.',
  'Supplied evidence conflicts.',
  'Supplied evidence is inconclusive.',
  'Supplied evidence is insufficient.',
]);
const missingItem = z.enum([
  'Independent facility confirmation',
  'Independent access policy',
  'Independent pricing policy',
  'Published operating information',
]);
export const aiOutputSchema = z
  .object({
    classification,
    confidence: z.number().min(0).max(1),
    access,
    pricing,
    operatingInformation,
    evidenceIds: z
      .array(evidenceSchema.shape.id)
      .max(12)
      .refine((ids) => new Set(ids).size === ids.length),
    reason,
    missingEvidence: z.array(missingItem).max(4),
    needsHumanReview: z.boolean(),
  })
  .strict();

export const responseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: Object.keys(aiOutputSchema.shape),
  properties: {
    classification: { type: 'string', enum: classification.options },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    access: { type: 'string', enum: access.options },
    pricing: { type: 'string', enum: pricing.options },
    operatingInformation: { type: 'string', enum: operatingInformation.options },
    evidenceIds: { type: 'array', maxItems: 12, items: { type: 'string' } },
    reason: { type: 'string', enum: reason.options },
    missingEvidence: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string', enum: missingItem.options },
    },
    needsHumanReview: { type: 'boolean' },
  },
};

export type Evidence = z.infer<typeof evidenceSchema>;
export type Classification = z.infer<typeof classification>;
export type AiOutput = z.infer<typeof aiOutputSchema>;
