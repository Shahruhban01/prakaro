import { setTimeout as delay } from 'node:timers/promises';
import { PROMPT_VERSION, type GeminiProvider } from './intelligence.gemini';
import {
  aiInputSchema,
  aiOutputSchema,
  type AiOutput,
  type Evidence,
} from './intelligence.schemas';
import { evaluateRules, hasFinding, warrantsGemini, type RulesResult } from './intelligence.rules';

export interface CallBudget {
  reserve(utcDay: string, limit: number): Promise<boolean>;
}

export type AiStatus =
  | 'DISABLED'
  | 'SHADOW_DISABLED'
  | 'NOT_CONFIGURED'
  | 'NO_EVIDENCE'
  | 'NOT_NEEDED'
  | 'CONFLICT'
  | 'BUSY'
  | 'BUDGET_EXHAUSTED'
  | 'BUDGET_UNAVAILABLE'
  | 'QUOTA_EXHAUSTED'
  | 'TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'INVALID_OUTPUT'
  | 'UNSUPPORTED_CLAIM'
  | 'EVALUATED';

export interface AiUsage {
  calls: number;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  callsWithTokenUsage: number;
}

export interface VerificationResult {
  baseline: RulesResult;
  result: RulesResult;
  assessment?: AiOutput;
  status: AiStatus;
  model: string;
  promptVersion: string;
  usage: AiUsage;
}

export interface IntelligenceOptions {
  enabled: boolean;
  shadowMode: boolean;
  model: string;
  dailyLimit: number;
  concurrency: number;
  timeoutMs: number;
  provider?: GeminiProvider;
  budget: CallBudget;
}

function supportedAssessment(
  output: AiOutput,
  evidence: Evidence[],
  baseline: RulesResult,
): boolean {
  const cited = evidence.filter(({ id }) => output.evidenceIds.includes(id));
  if (cited.length !== output.evidenceIds.length) return false;
  const citedRules = evaluateRules(cited);
  if (
    (output.access !== 'UNKNOWN' &&
      (output.access !== citedRules.access || output.access !== baseline.access)) ||
    (output.pricing !== 'UNKNOWN' &&
      (output.pricing !== citedRules.pricing || output.pricing !== baseline.pricing)) ||
    (output.operatingInformation !== 'UNKNOWN' &&
      (output.operatingInformation !== citedRules.operatingInformation ||
        output.operatingInformation !== baseline.operatingInformation))
  )
    return false;

  const positive = output.classification === 'LIKELY_PARKING';
  const negative = output.classification === 'LIKELY_NOT_PARKING';
  const supportsParking =
    hasFinding(cited, 'MARKED_PARKING_BAYS') && hasFinding(cited, 'DEDICATED_PARKING_ENTRANCE');
  const supportsExclusion =
    hasFinding(cited, 'NON_PARKING_BUSINESS_ON_SITE') &&
    hasFinding(cited, 'NO_PARKING_FOUND_ON_SITE');
  if (positive) {
    return (
      supportsParking &&
      !hasFinding(evidence, 'NO_PARKING_FOUND_ON_SITE') &&
      !hasFinding(evidence, 'NON_PARKING_BUSINESS_ON_SITE') &&
      output.reason === 'Supplied evidence supports a parking facility.'
    );
  }
  if (negative) {
    return (
      supportsExclusion &&
      !hasFinding(evidence, 'MARKED_PARKING_BAYS') &&
      !hasFinding(evidence, 'DEDICATED_PARKING_ENTRANCE') &&
      output.reason === 'Supplied evidence supports a non-parking listing.'
    );
  }
  return (
    output.reason === 'Supplied evidence is inconclusive.' ||
    output.reason === 'Supplied evidence is insufficient.'
  );
}

function safeTokenCount(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value ?? -1) >= 0 ? (value ?? 0) : 0;
}

export class IntelligenceService {
  private active = 0;
  private quotaRetryAt = 0;

  constructor(private readonly options: IntelligenceOptions) {}

  async verify(input: unknown): Promise<VerificationResult> {
    const parsed = aiInputSchema.safeParse(input);
    const evidence = parsed.success ? parsed.data.evidence : [];
    const baseline = evaluateRules(evidence);
    const usage: AiUsage = {
      calls: 0,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      callsWithTokenUsage: 0,
    };
    const complete = (status: AiStatus, assessment?: AiOutput): VerificationResult => ({
      baseline,
      result: assessment
        ? {
            ...baseline,
            classification: assessment.classification,
            needsHumanReview:
              assessment.needsHumanReview ||
              assessment.classification === 'UNCERTAIN' ||
              assessment.classification === 'INSUFFICIENT_EVIDENCE' ||
              assessment.classification === 'LIKELY_NOT_PARKING',
          }
        : baseline,
      assessment,
      status,
      usage,
      model: this.options.model,
      promptVersion: PROMPT_VERSION,
    });

    const { provider, budget, dailyLimit, concurrency, timeoutMs } = this.options;
    if (!this.options.shadowMode) return complete('SHADOW_DISABLED');
    if (!parsed.success) return complete('NO_EVIDENCE');
    if (baseline.outcomes.some(({ rule }) => rule === 'CONFLICTING_EVIDENCE')) {
      return complete('CONFLICT');
    }
    if (!warrantsGemini(baseline, evidence)) return complete('NOT_NEEDED');
    if (!this.options.enabled) return complete('DISABLED');
    if (!provider) return complete('NOT_CONFIGURED');
    if (this.active >= concurrency) return complete('BUSY');

    this.active++;
    try {
      // One retry for explicit transient server responses. Each attempt reserves its own budget unit.
      for (let attempt = 0; attempt < 2; attempt++) {
        if (Date.now() < this.quotaRetryAt) return complete('QUOTA_EXHAUSTED');
        try {
          const day = new Date().toISOString().slice(0, 10);
          if (dailyLimit === 0 || !(await budget.reserve(day, dailyLimit))) {
            return complete('BUDGET_EXHAUSTED');
          }
        } catch {
          return complete('BUDGET_UNAVAILABLE');
        }
        const controller = new AbortController();
        const started = performance.now();
        let timer: ReturnType<typeof setTimeout> | undefined;
        usage.calls++;
        try {
          const reply = await Promise.race([
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                controller.abort();
                reject(new Error('Gemini deadline exceeded'));
              }, timeoutMs);
            }),
            provider.classify(parsed.data, controller.signal),
          ]);
          usage.inputTokens += safeTokenCount(reply.inputTokens);
          usage.outputTokens += safeTokenCount(reply.outputTokens);
          if (reply.inputTokens !== undefined && reply.outputTokens !== undefined) {
            usage.callsWithTokenUsage++;
          }
          let decoded: unknown;
          try {
            decoded = JSON.parse(reply.text ?? '');
          } catch {
            return complete('INVALID_OUTPUT');
          }
          const output = aiOutputSchema.safeParse(decoded);
          if (!output.success) return complete('INVALID_OUTPUT');
          if (!supportedAssessment(output.data, evidence, baseline))
            return complete('UNSUPPORTED_CLAIM');
          return complete('EVALUATED', output.data);
        } catch (error) {
          if (controller.signal.aborted) return complete('TIMEOUT');
          const status =
            error && typeof error === 'object' && 'status' in error ? error.status : null;
          if (status === 429) {
            this.quotaRetryAt = Date.now() + 60_000;
            return complete('QUOTA_EXHAUSTED');
          }
          if (
            attempt > 0 ||
            (status !== 500 && status !== 502 && status !== 503 && status !== 504)
          ) {
            return complete('PROVIDER_ERROR');
          }
        } finally {
          clearTimeout(timer);
          usage.latencyMs += Math.round(performance.now() - started);
        }
        await delay(200);
      }
      return complete('PROVIDER_ERROR');
    } finally {
      this.active--;
    }
  }
}
