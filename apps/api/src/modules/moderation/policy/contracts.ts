import { z } from 'zod';

export const actions = z.enum(['APPROVE', 'REJECT', 'ESCALATE']);
export type PolicyAction = z.infer<typeof actions>;
const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).refine((key) =>
  !['constructor', 'prototype'].includes(key), 'Reserved identifier.');
const heading = z.string().trim().min(1).max(120);
const prose = z.string().trim().max(5000);
const choice = z.string().trim().min(1).max(80);
const scalar = z.union([z.string().max(500), z.number().finite(), z.boolean()]);
const condition = z.object({ key: identifier, equals: scalar }).strict();
const choices = z.array(choice).max(24).default([]);
const appliesTo = z.array(actions).min(1).max(3).default(actions.options);

export const tagSchema = z.object({
  id: identifier, label: heading, description: prose.default(''), category: heading.default('General'),
  severity: z.enum(['NONE','MINOR','MAJOR','CRITICAL']).default('NONE'), required: z.boolean().default(false),
  actions: appliesTo, when: condition.optional(), excludes: z.array(identifier).max(32).default([]),
  examples: z.array(z.string().trim().min(1).max(500)).max(8).default([]),
}).strict();
export const fieldSchema = z.object({
  id: identifier, label: heading, description: prose.default(''),
  type: z.enum(['SHORT_TEXT','LONG_TEXT','SELECT','MULTI','CHECKBOX','RADIO','NUMBER','DATE','EVIDENCE']),
  required: z.boolean().default(false), when: condition.optional(), options: choices,
  min: z.number().finite().optional(), max: z.number().finite().optional(),
  defaultValue: z.union([scalar, z.array(choice).max(24)]).optional(),
}).strict();
export const evidenceKind = z.enum(['INDEPENDENT_VERIFICATION','USER_SUBMITTED_PHOTO','LOCATION',
  'OWNERSHIP_DOCUMENT','REPORTER_EXPLANATION','EXTERNAL_ATTRIBUTION']);
export const evidenceRule = z.object({
  id: identifier, label: heading, type: evidenceKind, required: z.boolean().default(true),
  actions: appliesTo, tagIds: z.array(identifier).max(32).default([]), when: condition.optional(),
  minimum: z.number().int().min(1).max(12).default(1),
}).strict();

type Field = z.infer<typeof fieldSchema>;
function validValue(field: Field, value: unknown, evidenceIds: readonly string[] = []) {
  const inRange = (count: number) => count >= (field.min ?? -Infinity) && count <= (field.max ?? Infinity);
  switch (field.type) {
    case 'SHORT_TEXT': case 'LONG_TEXT':
      return typeof value === 'string' && Boolean(value.trim()) && value.length <= (field.type === 'SHORT_TEXT' ? 500 : 4000) && inRange(value.length);
    case 'SELECT': case 'RADIO': return typeof value === 'string' && field.options.includes(value);
    case 'MULTI': return Array.isArray(value) && value.length > 0 && value.length <= 24 &&
      new Set(value).size === value.length && value.every((item) => typeof item === 'string' && field.options.includes(item)) && inRange(value.length);
    case 'CHECKBOX': return typeof value === 'boolean' && (!field.required || value);
    case 'NUMBER': return typeof value === 'number' && Number.isFinite(value) && inRange(value);
    case 'DATE': return z.string().date().safeParse(value).success;
    case 'EVIDENCE': return typeof value === 'string' && evidenceIds.includes(value);
  }
}
export const policyDocument = z.object({
  overview: prose,
  sections: z.array(z.object({ title: heading, content: prose, examples: z.array(prose).max(8).default([]),
    relatedTags: z.array(identifier).max(32).default([]) }).strict()).max(16),
  decisionGuidance: z.array(z.object({ action: actions, text: prose }).strict()).max(3),
  tags: z.array(tagSchema).max(32),
  fields: z.array(fieldSchema).max(24),
  evidence: z.array(evidenceRule).max(16),
}).strict().superRefine((doc, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
  const duplicate = (values: readonly unknown[]) => new Set(values).size !== values.length;
  if (!doc.overview && !doc.sections.some(({ content }) => content)) issue(['overview'], 'Add policy guidance.');
  if (duplicate(doc.decisionGuidance.map(({ action }) => action))) issue(['decisionGuidance'], 'Use one set of instructions per decision.');
  const known = new Map<string, Field>();
  function validCondition(when: { key: string; equals: string | number | boolean } | undefined) {
    if (!when) return true;
    const dependency = known.get(when.key);
    if (dependency?.type === 'CHECKBOX') return typeof when.equals === 'boolean';
    return Boolean(dependency && validValue(dependency, when.equals));
  }
  doc.fields.forEach((field, index) => {
    if (known.has(field.id)) issue(['fields', index, 'id'], 'Duplicate field ID.');
    if (!validCondition(field.when)) issue(['fields', index, 'when'], 'Reference a previous field and a compatible value.');
    const selectable = ['SELECT','MULTI','RADIO'].includes(field.type);
    if ((selectable && !field.options.length) || (!selectable && field.options.length) || duplicate(field.options))
      issue(['fields', index, 'options'], 'Use distinct choices on select, multi-select, or radio fields.');
    const limit = ({ SHORT_TEXT: 500, LONG_TEXT: 4000, MULTI: 24 } as Record<string, number>)[field.type];
    const bounds = [field.min, field.max].filter((item): item is number => item !== undefined);
    if ((field.min ?? -Infinity) > (field.max ?? Infinity) ||
        (field.type !== 'NUMBER' && bounds.some((bound) => limit === undefined || !Number.isInteger(bound) || bound < 0 || bound > limit)))
      issue(['fields', index, 'min'], 'Bounds are incompatible with this field.');
    if (field.defaultValue !== undefined && !validValue({ ...field, required: false }, field.defaultValue))
      issue(['fields', index, 'defaultValue'], 'Choose a valid default.');
    known.set(field.id, field);
  });
  const tags = new Map(doc.tags.map((tag) => [tag.id, tag]));
  if (tags.size !== doc.tags.length) issue(['tags'], 'Tag IDs must be unique.');
  doc.tags.forEach((tag, index) => {
    if (!validCondition(tag.when)) issue(['tags', index, 'when'], 'Reference a valid field and value.');
    if (duplicate(tag.actions) || duplicate(tag.excludes) || tag.excludes.some((id) => !tags.has(id) || id === tag.id))
      issue(['tags', index, 'excludes'], 'Choose valid decisions and other existing tags.');
    if (tag.required && tag.excludes.some((id) => {
      const other = tags.get(id);
      return other?.required && tag.actions.some((action) => other.actions.includes(action)) &&
        (!tag.when || !other.when || tag.when.key !== other.when.key || tag.when.equals === other.when.equals);
    })) issue(['tags', index, 'excludes'], 'Two simultaneously required tags cannot exclude one another.');
  });
  doc.sections.forEach((section, index) => {
    if (duplicate(section.relatedTags) || section.relatedTags.some((tag) => !tags.has(tag)))
      issue(['sections', index, 'relatedTags'], 'Reference distinct tags from this version.');
  });
  if (duplicate(doc.evidence.map(({ id }) => id))) issue(['evidence'], 'Evidence rule IDs must be unique.');
  doc.evidence.forEach((rule, index) => {
    if (!validCondition(rule.when) || duplicate(rule.actions) || duplicate(rule.tagIds) || rule.tagIds.some((id) => !tags.has(id)))
      issue(['evidence', index], 'Use valid decisions, tags and a compatible field condition.');
    const supported = ['INDEPENDENT_VERIFICATION','REPORTER_EXPLANATION'].includes(rule.type);
    if (rule.required && !supported) issue(['evidence', index, 'type'], 'This evidence type can only be optional until an authorized source is available.');
    if (rule.type === 'REPORTER_EXPLANATION' && rule.minimum !== 1)
      issue(['evidence', index, 'minimum'], 'Only one submitted reporter explanation can be counted.');
  });
});
export type PolicyDocument = z.infer<typeof policyDocument>;
export type PolicyField = PolicyDocument['fields'][number];
export type PinnedPolicy = { id: string; policyId: string; number: number; document: PolicyDocument;
  contentHash: string | null; publishedAt: Date | string | null; policy: { name: string } };
export const policySelect = {
  id: true, policyId: true, number: true, document: true, contentHash: true,
  publishedAt: true, policy: { select: { name: true } },
} as const;

const valueAt = (answers: Record<string, unknown>, key: string) => Object.hasOwn(answers, key) ? answers[key] : undefined;
export function fieldVisible(when: z.infer<typeof condition> | undefined, answers: Record<string, unknown>) {
  return !when || valueAt(answers, when.key) === when.equals;
}
export function policyAnswers(doc: PolicyDocument, raw: Record<string, unknown>) {
  const answers: Record<string, unknown> = {};
  const visible = doc.fields.filter((field) => {
    if (!fieldVisible(field.when, answers)) return false;
    const value = valueAt(raw, field.id);
    if (value !== '' && value !== undefined && !(Array.isArray(value) && !value.length)) answers[field.id] = value;
    return true;
  });
  return { answers, visible };
}
export function validatePolicyDecision(doc: PolicyDocument, action: PolicyAction, raw: Record<string, unknown>,
  tagIds: readonly string[], independentIds: readonly string[], hasReporterExplanation: boolean) {
  const { answers, visible } = policyAnswers(doc, raw);
  const errors: Record<string, string> = Object.create(null);
  for (const field of visible) {
    const value = valueAt(answers, field.id);
    if (value === undefined ? field.required : !validValue(field, value, independentIds))
      errors[field.id] = field.label + ': enter a permitted value.';
  }
  if (Object.keys(raw).some((key) => !Object.hasOwn(answers, key))) errors.answers = 'Remove unknown or hidden answers.';
  const applicable = doc.tags.filter((tag) => tag.actions.includes(action) && fieldVisible(tag.when, answers));
  const selected = new Set(tagIds);
  if (selected.size !== tagIds.length || tagIds.some((id) => !applicable.some((tag) => tag.id === id)))
    errors.tags = 'Select only distinct tags available for this decision.';
  else if (applicable.some((tag) => tag.required && !selected.has(tag.id))) errors.tags = 'Select the required policy tags.';
  else if (applicable.some((tag) => selected.has(tag.id) && tag.excludes.some((id) => selected.has(id))))
    errors.tags = 'These policy tags cannot be selected together.';
  const distinctEvidence = new Set(independentIds).size;
  for (const rule of doc.evidence) {
    if (!rule.required || !rule.actions.includes(action) || !fieldVisible(rule.when, answers) ||
      !rule.tagIds.every((tag) => selected.has(tag))) continue;
    const count = rule.type === 'INDEPENDENT_VERIFICATION' ? distinctEvidence :
      rule.type === 'REPORTER_EXPLANATION' && hasReporterExplanation ? 1 : 0;
    if (count < rule.minimum) {
      errors.evidenceIds = 'Evidence required: ' + rule.label + ' (minimum ' + rule.minimum + ').';
      break;
    }
  }
  return errors;
}

const reportSchema = z.object({ category: z.string().max(80).optional(), notes: z.string().max(500).nullable().optional() });
export function safeReport(metadata: unknown) {
  const nested = z.object({ report: reportSchema }).safeParse(metadata);
  const parsed = nested.success ? nested.data.report : reportSchema.safeParse(metadata).data;
  return parsed && (parsed.category || parsed.notes) ? parsed : null;
}
export function reporterExplanation(metadata: unknown) {
  return Boolean(safeReport(metadata)?.notes?.trim());
}
