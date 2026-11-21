import type { ParkingDecision } from './intelligence.policy';
import type { AiOutput } from './intelligence.schemas';
import type { EvaluationRow } from './intelligence.metrics';

type Outcome = 'positive' | 'negative' | 'abstained';
type Task = 'genuineParking' | 'publiclyUsableParking';

export interface PolicyEvaluationRow extends EvaluationRow {
  id: string;
  scenario: string;
  truthAccess: AiOutput['access'];
  decision: ParkingDecision;
}

function outcome(parking: boolean | undefined, access: AiOutput['access'], task: Task): Outcome {
  if (parking === false) return 'negative';
  if (parking === undefined) return 'abstained';
  if (task === 'genuineParking') return 'positive';
  if (access === 'UNKNOWN') return 'abstained';
  return access === 'PUBLIC' ? 'positive' : 'negative';
}

function parkingClass(classification: EvaluationRow['truth']): boolean | undefined {
  if (classification === 'LIKELY_PARKING') return true;
  if (classification === 'LIKELY_NOT_PARKING') return false;
  return undefined;
}

function wilson(success: number, count: number) {
  if (!count) return null;
  const z = 1.96;
  const proportion = success / count;
  const denominator = 1 + (z * z) / count;
  const center = (proportion + (z * z) / (2 * count)) / denominator;
  const spread =
    (z * Math.sqrt((proportion * (1 - proportion) + (z * z) / (4 * count)) / count)) / denominator;
  return [Math.max(0, center - spread), Math.min(1, center + spread)];
}

const ratio = (hits: number, total: number) => (total ? hits / total : null);

export function comparePolicyMetrics(rows: PolicyEvaluationRow[]) {
  const hasGemini = rows.some(({ verification }) => verification.status === 'EVALUATED');
  function summarize(task: Task) {
    const truth = rows.map((row) => outcome(parkingClass(row.truth), row.truthAccess, task));
    const positive = truth.filter((item) => item === 'positive').length;
    const negative = truth.filter((item) => item === 'negative').length;
    const enoughLabels = rows.length >= 100 && positive >= 20 && negative >= 20;

    function measure(arm: 'rulesOnly' | 'rulesPlusGemini' | 'policy') {
      if (!rows.length || (arm === 'rulesPlusGemini' && !hasGemini)) return null;
      const matrix = {
        positive: { positive: 0, negative: 0, abstained: 0 },
        negative: { positive: 0, negative: 0, abstained: 0 },
      };
      const examples = {
        falsePositive: [] as Array<{ id: string; scenario: string }>,
        falseNegative: [] as Array<{ id: string; scenario: string }>,
        uncertain: [] as Array<{ id: string; scenario: string }>,
      };
      let uncertain = 0;
      let humanReview = 0;
      rows.forEach((row, index) => {
        const reviewed = truth[index];
        const rules = arm === 'rulesOnly' ? row.verification.baseline : row.verification.result;
        const facility = row.decision.facilityStatus;
        const parking =
          arm === 'policy'
            ? facility === 'INDEPENDENTLY_VERIFIED' || facility === 'STRONGLY_SUPPORTED'
              ? true
              : facility === 'CONTRADICTED'
                ? false
                : undefined
            : parkingClass(rules.classification);
        const predicted = outcome(
          parking,
          arm === 'policy' ? row.decision.access : rules.access,
          task,
        );
        if (reviewed === 'positive' || reviewed === 'negative') matrix[reviewed][predicted]++;
        if (predicted === 'abstained') uncertain++;
        if (arm === 'policy' ? row.decision.reviewRequired : rules.needsHumanReview) humanReview++;
        const kind =
          predicted === 'abstained'
            ? 'uncertain'
            : reviewed === 'negative' && predicted === 'positive'
              ? 'falsePositive'
              : reviewed === 'positive' && predicted === 'negative'
                ? 'falseNegative'
                : undefined;
        if (kind && examples[kind].length < 5)
          examples[kind].push({ id: row.id, scenario: row.scenario });
      });
      const tp = matrix.positive.positive;
      const fp = matrix.negative.positive;
      return {
        matrix,
        precision: ratio(tp, tp + fp),
        recall: ratio(tp, positive),
        falsePositiveRate: ratio(fp, negative),
        falseNegativeRate: ratio(matrix.positive.negative, positive),
        uncertainRate: ratio(uncertain, rows.length),
        humanReviewRate: ratio(humanReview, rows.length),
        precisionInterval95: wilson(tp, tp + fp),
        recallInterval95: wilson(tp, positive),
        examples,
      };
    }

    const rulesOnly = measure('rulesOnly');
    const rulesPlusGemini = measure('rulesPlusGemini');
    const policy = measure('policy');
    function counts(result: ReturnType<typeof measure>) {
      if (!result) return null;
      const { positive, negative } = result.matrix;
      return {
        correct: positive.positive + negative.negative,
        incorrect: positive.negative + negative.positive,
        uncertainOnKnownTruth: positive.abstained + negative.abstained,
        falsePositives: negative.positive,
        falseNegatives: positive.negative,
      };
    }
    return {
      observedCounts: {
        rulesOnly: counts(rulesOnly),
        rulesPlusGemini: counts(rulesPlusGemini),
        policy: counts(policy),
      },
      labels: { positive, negative, unknown: rows.length - positive - negative },
      enoughLabels,
      rulesOnly: enoughLabels ? rulesOnly : null,
      rulesPlusGemini: enoughLabels ? rulesPlusGemini : null,
      policy: enoughLabels ? policy : null,
    };
  }
  return {
    genuineParking: summarize('genuineParking'),
    publiclyUsableParking: summarize('publiclyUsableParking'),
    verifiedCoverage:
      rows.length >= 100
        ? ratio(
            rows.filter(({ decision }) => decision.facilityStatus === 'INDEPENDENTLY_VERIFIED')
              .length,
            rows.length,
          )
        : null,
    geminiCoverage: ratio(
      rows.filter(({ verification }) => verification.status === 'EVALUATED').length,
      rows.length,
    ),
  };
}
