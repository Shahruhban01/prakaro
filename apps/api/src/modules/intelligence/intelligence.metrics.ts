import type { Classification } from './intelligence.schemas';
import type { VerificationResult } from './intelligence.service';
import type { RulesResult } from './intelligence.rules';

// Transient process counters. No provider IDs, classifications, or candidate attributes are retained.
export class ShadowMetrics {
  private batches = 0;
  private candidates = 0;
  private suspicious = 0;

  recordBatch(results: RulesResult[]) {
    this.batches++;
    this.candidates += results.length;
    this.suspicious += results.filter(({ outcomes }) =>
      outcomes.some(({ outcome }) => outcome === 'SUSPICIOUS'),
    ).length;
  }

  snapshot() {
    return { batches: this.batches, candidates: this.candidates, suspicious: this.suspicious };
  }
}

export interface EvaluationRow {
  truth: Classification;
  verification: VerificationResult;
}

export interface TokenRates {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

const ratio = (numerator: number, denominator: number) =>
  denominator ? numerator / denominator : null;

export function evaluateMetrics(rows: EvaluationRow[], rates?: TokenRates) {
  const positive = rows.filter(({ truth }) => truth === 'LIKELY_PARKING').length;
  const negative = rows.filter(({ truth }) => truth === 'LIKELY_NOT_PARKING').length;
  const enoughLabels = rows.length >= 100 && positive >= 20 && negative >= 20;
  const ai = rows.reduce(
    (total, { verification: { usage } }) => ({
      calls: total.calls + usage.calls,
      latencyMs: total.latencyMs + usage.latencyMs,
      inputTokens: total.inputTokens + usage.inputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      callsWithTokenUsage: total.callsWithTokenUsage + usage.callsWithTokenUsage,
    }),
    { calls: 0, latencyMs: 0, inputTokens: 0, outputTokens: 0, callsWithTokenUsage: 0 },
  );

  function summarize(mode: 'baseline' | 'result') {
    let tp = 0;
    let fp = 0;
    let tn = 0;
    let fn = 0;
    let abstainedOnPositive = 0;
    let abstainedOnNegative = 0;
    let uncertain = 0;
    let review = 0;
    for (const { truth, verification } of rows) {
      const prediction = verification[mode];
      const predictedParking = prediction.classification === 'LIKELY_PARKING';
      const predictedNonParking = prediction.classification === 'LIKELY_NOT_PARKING';
      const abstained = !predictedParking && !predictedNonParking;
      if (truth === 'LIKELY_PARKING') {
        if (predictedParking) tp++;
        if (predictedNonParking) fn++;
        if (abstained) abstainedOnPositive++;
      } else if (truth === 'LIKELY_NOT_PARKING') {
        if (predictedParking) fp++;
        if (predictedNonParking) tn++;
        if (abstained) abstainedOnNegative++;
      }
      if (abstained) uncertain++;
      if (prediction.needsHumanReview) review++;
    }
    return enoughLabels
      ? {
          tp,
          fp,
          tn,
          fn,
          abstainedOnPositive,
          abstainedOnNegative,
          precision: ratio(tp, tp + fp),
          recall: ratio(tp, positive),
          falsePositiveRate: ratio(fp, negative),
          falseNegativeRate: ratio(fn, positive),
          uncertainRate: ratio(uncertain, rows.length),
          humanReviewRate: ratio(review, rows.length),
        }
      : null;
  }

  return {
    samples: rows.length,
    positive,
    negative,
    enoughLabels,
    rulesOnly: summarize('baseline'),
    rulesPlusGemini: rows.some(({ verification }) => verification.status === 'EVALUATED')
      ? summarize('result')
      : null,
    ai: {
      ...ai,
      callsPerEvaluation: ratio(ai.calls, rows.length),
      averageLatencyMs: ratio(ai.latencyMs, ai.calls),
      estimatedApiCostUsd:
        ai.calls === 0
          ? 0
          : rates && ai.callsWithTokenUsage > 0
            ? (ai.inputTokens * rates.inputUsdPerMillion +
                ai.outputTokens * rates.outputUsdPerMillion) /
              1_000_000
            : null,
      costEstimatePartial: ai.callsWithTokenUsage < ai.calls,
      statuses: Object.fromEntries(
        [...new Set(rows.map(({ verification }) => verification.status))].map((status) => [
          status,
          rows.filter(({ verification }) => verification.status === status).length,
        ]),
      ),
    },
  };
}
