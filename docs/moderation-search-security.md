# Prakaro — Search-Driven Moderation Intake & Anti-Abuse Security
**Document Version:** 1.0.0 (Milestone 13.1 Search Security)  
**Classification:** Platform Intake Security & Anti-Abuse Controls  
**Target Modules:** `apps/api/src/modules/moderation/intake.ts`  

---

## 1. Threat Model & Abuse Vectors

The search-driven intake pipeline bridges real mobile driver discovery queries directly with human moderation queues. Without strict defensive controls, this channel presents severe abuse vectors:
1. **Queue Flooding / DoS**: Malicious clients executing thousands of automated searches to exhaust moderator queues and daily case limits.
2. **Actor Enumeration**: Attackers attempting to infer driver identities or trace search habits through moderation intake logs.
3. **Duplicate Case Pollution**: Creating multiple active moderation cases for the same physical parking garage.
4. **Demand Suppression vs. Event Deduplication**: Silently dropping repeat searches, which falsely depresses the demand signal needed for priority routing.

---

## 2. Cryptographic Privacy & Anonymization

Driver user IDs are never stored in plaintext within moderation intake counters or audit admission logs. All actor and event identifiers are transformed using HMAC-SHA256 with the server-side `BETTER_AUTH_SECRET`:

```typescript
function digest(value: string) {
  return createHmac('sha256', env.BETTER_AUTH_SECRET).update(value).digest('hex');
}

// Scoped actor identifier (salted by UTC date to prevent cross-day tracking)
const actor = digest(day + ':' + userId);

// Scoped event identifier
const event = digest(actor + ':' + eventId);
```

### Privacy Guarantees:
- **Zero Cross-Day Tracking**: An actor's daily hash resets at 00:00 UTC, preventing longitudinal tracking of search patterns by internal moderation staff.
- **Unlinkable Pseudonyms**: Moderation staff see only synthetic demand metrics and queue priority scores, never driver identities.

---

## 3. Rate Limiting & Abuse Quotas

To prevent queue flooding, three strict layers of rate limiting are enforced in `apps/api/src/modules/moderation/intake.ts`:

1. **Per-Actor Hourly Budget**:
   - Each authenticated mobile driver is limited to a maximum of **20 admitted candidates per day**.
   - Excess queries from an abusive client are safely processed by the consumer discovery API, but candidate admission into moderation is silently dropped.
2. **Global Daily Intake Ceiling**:
   - Monitored via `moderationCounter` (`cases:${day}`).
   - Capped by `MODERATION_DAILY_CASE_LIMIT` (default: 50 new cases/day).
   - Once the ceiling is reached, intake closes gracefully without impacting user search responses.
3. **Candidate Validation & Schema Strictness**:
   - Only facilities with valid Google Places IDs matching `/^google:[A-Za-z0-9_-]{1,191}$/` are admitted.
   - Non-parking facilities (e.g. coffee shops, residential pins) are filtered out prior to case routing.

---

## 4. Deduplication vs. Demand Signal Incrementing

A critical architectural challenge in Milestone 13 was ensuring that repeat searches by different drivers do not generate duplicate cases, while accurately registering increased demand:

```mermaid
flowchart TD
    S1["Driver 1 Searches Area A"] --> INT["Intake Pipeline"]
    INT --> CHK{"Does Case Exist for Facility?"}
    CHK -->|No| CRT["Create Active Case (Demand = 1)<br>Generate activeKey: facility:category"]
    CHK -->|Yes| INC["Increment Search Demand (Demand = 2)<br>Keep Existing Active Case"]
    
    S2["Driver 2 Searches Area A"] --> INT
    INT --> DUP{"Same Search Event & Facility?"}
    DUP -->|Yes (Re-render)| IGN["Skip duplicate within response"]
    DUP -->|No (Distinct Event)| INC
```

### Implementation Mechanics:
1. **Intra-Event Deduplication**: Scoped to `digest(event + ':facility:' + googlePlaceId)`. Prevents a single search response containing repeated references from counting multiple times.
2. **Active Case Key**: Each case registers an `activeKey` formatted as `${facilityId}:${category}` with a `@unique` constraint in MySQL.
3. **Demand Upsert**: Subsequent searches for an existing facility increment `SearchAdmission.demand` without creating redundant cases.
4. **Queue Prioritization**: Queues with rules matching `rule: { field: 'demand', value: '5' }` automatically promote high-demand cases to high-priority queues.
