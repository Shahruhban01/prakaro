import type { GooglePlaceItem } from '../../integrations/google-places/google-places.types';
import { evaluateRules, warrantsGemini } from './intelligence.rules';
import { ShadowMetrics } from './intelligence.metrics';
import {
  claimRun,
  createIntelligenceService,
  finishRun,
  loadApprovedCases,
} from './intelligence.store';
import { env } from '../../config/env';
import type { IntelligenceService } from './intelligence.service';

export type DiscoveryObserver = (places: GooglePlaceItem[]) => void;
export const shadowMetrics = new ShadowMetrics();

export function inspectProviderBatch(places: GooglePlaceItem[]) {
  const ids = places.map((place) => (typeof place?.id === 'string' ? place.id.trim() : ''));
  const counts = new Map<string, number>();
  for (const id of ids) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);

  return places.flatMap((place, index) => {
    const id = ids[index];
    if (!id || !place) return [];
    return [
      {
        id,
        rules: evaluateRules([], {
          primaryType: place.primaryType,
          types: Array.isArray(place.types) ? place.types : undefined,
          businessStatus: place.businessStatus,
          parkingOption: Object.values(place.parkingOptions ?? {}).includes(true),
          duplicate: (counts.get(id) ?? 0) > 1,
        }),
      },
    ];
  });
}

interface ShadowOptions {
  shadowMode: boolean;
  evaluateWithGemini: boolean;
  maxPerBatch: number;
  service: Pick<IntelligenceService, 'verify'>;
  loadCases: typeof loadApprovedCases;
  claim: typeof claimRun;
  finish: typeof finishRun;
}

export function createDiscoveryObserver(
  onFailure: () => void,
  options: ShadowOptions = {
    shadowMode: env.AI_SHADOW_MODE,
    evaluateWithGemini: Boolean(
      env.AI_VERIFICATION_ENABLED && env.GEMINI_API_KEY && env.AI_MAX_CALLS_PER_DAY,
    ),
    maxPerBatch: Math.min(2, env.AI_MAX_CONCURRENT_REQUESTS),
    service: createIntelligenceService(true),
    loadCases: loadApprovedCases,
    claim: claimRun,
    finish: finishRun,
  },
): DiscoveryObserver {
  let active = false;

  async function observe(places: GooglePlaceItem[]) {
    const candidates = inspectProviderBatch(places);
    shadowMetrics.recordBatch(candidates.map(({ rules }) => rules));
    if (!options.evaluateWithGemini) return;

    // Provider ID matches a reviewer-maintained link. The model path uses only independent findings.
    const reviewed = await options.loadCases([...new Set(candidates.map(({ id }) => id))]);
    const tasks: Promise<void>[] = [];
    try {
      for (const record of reviewed) {
        if (tasks.length >= options.maxPerBatch) break;
        const rules = evaluateRules(record.input.evidence);
        if (!warrantsGemini(rules, record.input.evidence)) continue;
        const id = await options.claim(record.id, record.input.evidence);
        if (id)
          tasks.push(
            options.service
              .verify(record.input)
              .then((result) => options.finish(id, result))
              .catch(onFailure),
          );
      }
    } finally {
      await Promise.all(tasks);
    }
  }

  return (places) => {
    if (!options.shadowMode || active || !Array.isArray(places) || places.length === 0) return;
    active = true;
    const batch = places.slice(0, 20);
    setImmediate(() => {
      void observe(batch)
        .catch(onFailure)
        .finally(() => {
          active = false;
        });
    });
  };
}
