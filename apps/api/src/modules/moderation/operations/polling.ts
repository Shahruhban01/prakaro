import type { AnalyticsActor } from '../analytics-scope';
import { canAdmin, type Range } from './schedule';

type Snapshot<T> = { value: Promise<T>; expiresAt: number };
/** Collapse overlapping executive reads. Identity is checked by Fastify before a lookup. */
export function executivePolling<T>(ttlMs = 4000, maxEntries = 32) {
  const cache = new Map<string, Snapshot<T>>();
  return async (actor: AnalyticsActor, query: Range, run: () => Promise<T>): Promise<T> => {
    if (!canAdmin(actor) || query.employeeId || query.teamId || query.managerId || query.lobId || query.queueId ||
      query.shiftId || query.attendance || query.aux) return run();
    const key = JSON.stringify([actor.superAdmin ? 'platform' : actor.organizationId, query]);
    const now = Date.now();
    const entry = cache.get(key);
    if (entry && entry.expiresAt > now) return entry.value;
    for (const [id, snapshot] of cache) if (snapshot.expiresAt <= now) cache.delete(id);
    if (cache.size >= maxEntries) return run();
    const state = { value: Promise.resolve().then(run), expiresAt: Infinity };
    cache.set(key, state);
    try {
      const result = await state.value;
      state.expiresAt = Date.now() + ttlMs;
      return result;
    } catch (error) {
      cache.delete(key);
      throw error;
    }
  };
}
