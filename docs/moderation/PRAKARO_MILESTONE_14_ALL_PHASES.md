# PRAKARO — MILESTONE 14
## Enterprise Moderation Operations Platform — Complete 10-Phase Implementation Specification

**Document status:** Implementation blueprint / requirements baseline  
**Scope:** Correct the existing Milestone 13/13.1 moderation architecture without rewriting Prakaro parking discovery.  
**Primary applications:** `apps/api` (Fastify, TypeScript, Prisma, MySQL, Better Auth), `apps/moderation` (React, Vite, TypeScript), `apps/mobile` (Flutter).  
**Execution rule:** Implement sequentially, with a passing acceptance gate after each phase. Audit the real repository and preserve data before changes.

---

## 0. Authoritative product rules

1. **Three identity domains remain separate:** `users` for Flutter customers; `super_admins` for owner-side platform administrators; `moderators` for organization admins, managers, supervisors, QA, and moderators. Keep the installed Better Auth integration and ensure sessions are isolated.
2. **One employee = exactly one organization and one LOB.** Each employee's organization and LOB must agree with the LOB's organization assignment. Supervisors/managers may manage teams with members from several LOBs *within their authorized organizational scope*; they do not gain additional personal LOB memberships.
3. **Super Admin** manages everything platform-wide, including organizations, LOBs, queue routing, access and staff. **Organization Admin (Director)** manages exactly one organization and its assigned LOBs, and may create/configure queues only when delegated permission. **Only Super Admin creates new LOBs** and assigns LOBs to organizations; organization admins manage membership and operations of assigned LOBs.
4. **Managers** manage assigned teams and LOB operations, supervisors, moderation and QA performance. **Moderation Supervisors / QA Supervisors** manage their assigned teams and relevant productivity/quality metrics. **Moderators** handle cases. **QA** samples completed moderator decisions and records quality outcomes.
5. **Queue access is assigned to LOBs**, never as an ad-hoc direct moderator grant. A moderator may **self-subscribe** to any queue allowed for their single LOB; only subscribed queues appear on their worklist. Revoking LOB access immediately revokes the derived permission and invalidates active work safely.
6. **No standalone global Cases page.** Cases belong to queues and are accessed through queue dashboards, authorized QA views and the isolated continuous moderation workspace.
7. **Continuous Moderate mode:** A moderator must be in `MODERATING` AUX, enter an allowed subscribed queue, receive one *strictly random* eligible pending case, and see a server-anchored case timer. On **Submit**, commit the moderator decision immediately, record case handling time, and automatically serve another case on the same page. On **Submit & Leave**, commit the current decision, record the leave event and exit the moderation session.
8. **View mode is read-only.** It may visually preview tags/decisions, but no mutation, reservation, handling record, published decision or productivity event is allowed.
9. **No concurrent case collision:** Two moderators must never hold the same active case. Random assignment must be uniform among eligible pending cases (not priority-ordered), using an atomic database reservation. Prefetching the next case is optional but must not create unfair or unbounded extra reservations; prefer reserving at submit/next transition.
10. **Moderator decision is final for initial workflow:** It takes effect immediately when submitted, subject to existing evidence and publication safety constraints. **QA is sampled/post-decision, not mandatory pre-publication approval.** QA may inspect any authorized completed case, attribute an error to the original moderator, and reopen for remoderation. The original effective decision remains until a corrected moderator decision is submitted, with complete version history.
11. **AUX has six states:** `MODERATING`, `NON_MODERATING`, `BREAK`, `MEETING`, `OFFLINE`, `TRAINING`. All relevant staff punch AUX. While an active case is held, AUX changes are disabled; first submit or safely release the case. Only `MODERATING` permits active moderation. Authorized supervisors/managers/admins may view and manage AUX within scope, with auditable corrections rather than rewriting history.
12. **AHT unit is seconds everywhere** (UI, APIs, dashboards, exports, reports). Capture raw duration precisely (e.g., milliseconds), calculate `AHT_seconds = sum(eligible completed handling duration seconds) / number of eligible completed cases`. Never average individual AHTs to produce a team/queue AHT. Exclude View mode, abandoned cases and duplicate submissions; track remoderation as separate handling records.
13. **Parking verification integrity:** A moderator's completed decision may be published immediately, but `INDEPENDENTLY_VERIFIED` is only permitted with the independently required evidence. Unknown must never be represented as free, public, open or verified. Retain Google Maps Platform usage constraints, source attribution and restrictions on third-party AI transmission.
14. **Search-driven intake remains intact:** New discovery-based cases originate only from real user-initiated parking searches and returned candidates; user reports enter their configured report queues. No random geographic crawling, duplicate floods or silent background discovery.
15. **Audit, security and privacy:** Server-side RBAC and organization/LOB boundaries, secure session handling, idempotency, atomic transactions, immutable audit history, minimal location data retention, and safe operational recovery are mandatory.

---

## 1. Phase 1 — Organizations, LOBs and organizational hierarchy

### Objective
Build tenant-aware workforce structure and enforce one-organization/one-LOB staff membership while preserving the three identity tables.

### Implementation
- Audit `schema.prisma`, migrations, staff auth, current queue permissions, cases, QA, audits and historical records. Produce a database backup and migration plan before applying changes.
- Introduce `Organization` (stable ID, name, status, settings, timestamps), `LOB` (stable ID, name/code, owner/assignment, status), and explicit organizational hierarchy/assignment entities as needed.
- Define exactly one `organizationId` and one `lobId` per active staff identity; use transactional validation and database constraints. For onboarding before assignment, support a non-operational `PENDING_ASSIGNMENT` state rather than allowing unscoped work.
- Super Admin alone creates LOBs and assigns/reassigns them to organizations. Admins manage membership and operational configuration of their organization's assigned LOBs but cannot create new LOBs.
- An organization Admin manages exactly one organization. Define manager-to-team and supervisor-to-team assignments; a team may include members from multiple LOBs in that organization.
- Roles include `MODERATION_ADMIN`, `MANAGER`, `MOD_SUPERVISOR`, `QA_SUPERVISOR`, `MODERATOR`, `QA_REVIEWER`; map legacy roles (`MODERATION_MANAGER`, `SUPERVISOR`, etc.) explicitly and preserve historical audit attribution.
- Build organization, LOB, staff, team and assignment screens with scoped server-side APIs. Preserve existing Better Auth session isolation.

### Acceptance gate
- Create two organizations and several LOBs; assign each LOB to exactly one organization at a time.
- Confirm a staff member cannot join a second organization or LOB; cannot be assigned an LOB outside their organization.
- Confirm managers/supervisors can oversee authorized cross-LOB teams without gaining access outside the organization.
- Confirm only Super Admin creates LOBs; Admin cannot access another organization's staff.
- Run schema migration, authorization, authentication and regression tests; document rollback.

---

## 2. Phase 2 — Queue architecture, LOB access and subscriptions

### Objective
Make queues the only case containers and the unit of moderator work and management.

### Implementation
- Preserve or migrate existing queues and case history; remove the global Cases navigation after queue-scoped replacements exist.
- Allow Super Admin and **explicitly delegated** organization Admins to create/configure queues. Define queue owner organization, queue code, status, case admission/routing rules, form/policy version, retention and capacity controls.
- Define `LOBQueueAccess(queueId, lobId, grantedBy, grantedAt, revokedAt)` with uniqueness, org compatibility and full audit trail. No direct individual queue grants.
- Define `QueueSubscription(moderatorId, queueId, subscribedAt, status)`; validate moderator's single LOB has active queue access. Revalidate on every read, claim and submission.
- Add discoverable **Allowed Queues** and **Subscribed Queues**; only subscribed queues show in the moderator's primary worklist. Allow subscribe/unsubscribe and clear access-revoked states.
- Queue has `Moderate` and `View` actions, live unmoderated count, in-progress count, active moderators, completed count and AHT in seconds.
- Queue dashboard contains case views, scoped performance, history and staff stats. Case routing may support user reports, search-discovered candidates and other explicitly authorized sources; dedupe cases and preserve source provenance.
- Use backend-calculated counts with polling or server-sent events/WebSockets as appropriate; don't fake real-time data.

### Acceptance gate
- GG-MODS can access two queues; HRP-PLACES one; SRH-DEST three (illustrative fixtures).
- A moderator can subscribe only to queues permitted for their single LOB.
- Revoking LOB queue access removes subscriptions' effective permissions and safely terminates/resolves active work.
- Cases are navigable inside queues, not via a standalone global Cases page.
- Queue dashboards show correct live counts and AHT in seconds.

---

## 3. Phase 3 — AUX management and attendance

### Objective
Record authoritative work status and time for moderators, QA, supervisors and managers.

### Implementation
- Six AUX values: `MODERATING`, `NON_MODERATING`, `BREAK`, `MEETING`, `OFFLINE`, `TRAINING`.
- Model `AuxTransition`/`AuxSession` with staff ID, start/end timestamps, actor, source, reason, optional correctedBy and immutable correction log. Track login/session presence separately from self-reported AUX.
- Atomic transition API closes prior interval and opens new interval; prevent overlapping active AUX intervals. Make transitions idempotent and server timestamped.
- Only moderators in `MODERATING` may claim and submit active moderation work. Block AUX changes while a case reservation exists; permit explicit safe release first, with a reason and no completed AHT.
- Provide AUX selector in console, current status indicator, history, live team status and scoped manager/admin correction workflows. A browser disconnect must not indefinitely count as active moderation; define heartbeat and idle/timeout policy without silently falsifying punch records.
- Report total seconds per AUX, attendance windows, login time, break time and offline time; distinguish logged-out from AUX Offline.

### Acceptance gate
- Each transition produces exactly one bounded interval and accurate seconds.
- Changing AUX with an active case fails with an actionable error.
- Non-MODERATOR or non-MODERATING users cannot start Moderate mode.
- Team and organization AUX dashboards respect role scope.

---

## 4. Phase 4 — Continuous moderation backend engine

### Objective
Provide strictly random, collision-free case assignment and rapid sequential decisions.

### Implementation
- Create `ModerationWorkSession`, `CaseReservation`, `CaseHandlingRecord`, `ModerationDecisionVersion` and related audit/idempotency entities as appropriate.
- `POST /queues/:queueId/moderate/start` validates identity, org/LOB, active subscription, queue status and `MODERATING` AUX; starts work session and atomically reserves one eligible pending case.
- **Strict randomness:** sample uniformly from currently eligible pending cases (not priority or oldest-first); document algorithm, performance tradeoffs and fairness tests. Selection and reservation must be atomic (e.g., transaction + locking/unique active reservation constraint) so concurrent workers never receive the same case.
- Maintain at most one active reservation per moderator and one per case. Lease expiry, heartbeat, recovery and explicit release must be safe. Avoid assigning a new case before the prior decision is durably committed.
- Server records `startedAt` and `submittedAt`, calculates eligible `handlingSeconds` from high-resolution timestamps, and stores exact duration. Handle pauses only if explicitly defined and audited.
- `POST /work-sessions/:id/submit` validates case reservation, decision form/policy/evidence, idempotency key and session state; transactionally saves decision and handling record, updates effective status immediately, releases reservation and returns a freshly reserved random next case (or empty-queue state).
- `POST /work-sessions/:id/submit-and-leave` commits final decision, records leave action, ends session, returns to subscribed queues and unlocks AUX.
- Implement explicit safe release of current case without completed-case credit; count releases separately from Submit & Leave.
- Revalidate access at every mutation; handle duplicate clicks, retries, stale cases, expired leases, crash recovery, revoked LOB access, queue pause and no remaining cases.
- Do not auto-mark independently verified without qualifying independent evidence. Publish only authorized decision effects.

### Acceptance gate
- Concurrent load tests prove no two moderators hold the same active case.
- Statistical tests support uniform random selection across eligible cases; document test limitations.
- Submit commits once, records seconds once and serves a different eligible case on the same work session.
- Submit & Leave commits once and ends session; repeated requests are idempotent.
- Session crash/lease expiry returns unfinished work safely without counting it as completed AHT.

---

## 5. Phase 5 — Dedicated React continuous moderation workspace

### Objective
Deliver the full-screen moderator workflow with minimal navigation overhead.

### Screen specification
- Header: Prakaro Moderation, queue name, organization/LOB context, current AUX badge (locked while case active), connection status, work session ID.
- Current case: ID, case source/type, reported facility, allowed location/map/evidence, report details, decision history and policy references.
- Main review: configurable queue form, tag selector, evidence guidance, validation errors and optional notes.
- Right context: case handling timer in **seconds** (`128s`), completed session count, session AHT in seconds, queue pending count, policy clarifications.
- Sticky bottom actions: **Submit** (commit + next) and **Submit & Leave** (commit + exit). Disable buttons while processing and show retry-safe feedback.
- Same route remains mounted while case ID and content change. Reset displayed timer only after server confirms next reservation.
- If queue empty, show a clear waiting/leave state; do not fabricate cases or loop aggressively.
- Keyboard accessibility, responsive layout, loading/error states and safe navigation warnings for an active reservation.
- `View` is explicitly marked **READ-ONLY PREVIEW**; even if form controls are interactable for exploration, no mutation endpoint, reservation, timer credit or submission is allowed.

### Acceptance gate
- Browser test: enter Moderate, review 10 cases, submit each, use Submit & Leave on final case; observe same workspace, new IDs and accurate seconds.
- AUX control is disabled during active case and enabled after safe completion/release.
- View mode causes zero backend mutations or productivity changes.
- Unauthorized and disconnected states recover safely.

---

## 6. Phase 6 — Performance, AHT and real-time analytics

### Objective
Deliver accurate, auditable performance metrics at employee, team, LOB, queue and organization levels.

### Definitions
- `handlingSeconds`: actual eligible time spent on a completed moderation handling record, computed from server timestamps; preserve raw precision and expose seconds.
- `AHT_seconds = SUM(handlingSeconds for eligible completed cases) / COUNT(eligible completed cases)`.
- `casesCompleted`: count of distinct successfully committed handling submissions, with remoderation separately classified.
- `submitAndLeaveCount`: number of successful Submit & Leave actions.
- `submitAndLeaveRate = submitAndLeaveCount / successful submissions` (define display percentage and zero denominator behavior).
- `casesPerHour`: completed cases / eligible moderating hours (state clearly which time basis is used).
- `QA_sampleAccuracy`: QA passes / QA samples scored; display sample size and period, not misleading all-case accuracy.
- AUX durations and logged-in durations are separate; define working-hours calculations explicitly.

### Implementation
- Use event/handling-record-derived aggregation, not mutable frontend counters.
- Real-time queue dashboard: pending, reserved, active workers, completions, AHT_seconds, throughput and individual worker statistics.
- Moderator personal dashboard: cases completed, AHT_seconds, Submit & Leave rate, AUX durations, login/break/offline time and sampled QA feedback.
- Supervisor/manager/Admin/Super Admin scoped dashboards with date/time range, queue/LOB/team/person filters and export controls.
- Prevent double counting on retries, case reopen, QA sampling and remoderation.
- Show seconds (`85s`, `112.5s`), never convert the AHT label to minutes. Round for presentation only; preserve precision in computation.

### Acceptance gate
- Seed deterministic sample handling durations and verify weighted AHT results in seconds for individual/team/queue/LOB/org.
- Verify zero-case, empty-window, reopened and remoderated cases.
- Live counts update after submit, leave, release, access revocation and QA reopen.
- Scoped analytics never leak cross-organization data.

---

## 7. Phase 7 — QA sampling, error attribution and remoderation

### Objective
Make QA a post-publication quality audit, not a gate on every moderator decision.

### Implementation
- On moderator Submit, effective decision changes immediately (subject to existing evidence constraints); mark completed decision as QA-eligible, not `PENDING_QA`.
- Create QA sample policies: configurable random sampling rate and optional manual selection of any authorized completed case. Record sampling methodology, eligibility window and avoid duplicate QA scoring of same decision version unless explicitly allowed.
- QA reviewer can inspect original evidence, selected tags, policy version, moderator decision and history; score `ACCURATE` or `ERROR`, attach error category, reasoning and evidence.
- QA errors are attributed to the **original moderator** and reflected in their quality record and scoped team dashboards.
- On error, QA can **reopen for remoderation** in the appropriate queue; preserve the original effective decision until corrected decision is committed. Mark the case as under correction without falsely rewriting historical decisions.
- Remoderation must create a new decision version and handling record; identify original reviewer, QA reviewer and correcting reviewer. Define whether self-remoderation is allowed (default: disallow when practical, to reduce bias).
- Keep QA supervisor quality dashboards: sampling volume, coverage, sample accuracy, errors by policy/tag/team/LOB, reopen backlog and time to correction.
- Maintain immutable audit and distinguish QA finding from a superseding operational decision.

### Acceptance gate
- 100 completed cases with 10 QA samples and 8 passes reports **80% sampled accuracy**, not 80% all-case accuracy.
- QA does not block normal publication.
- Error → reopen → new moderator decision works; original decision remains until correction and history stays intact.
- QA cannot modify original moderator's handling time or silently erase errors.

---

## 8. Phase 8 — Policies, tags and clarifications

### Objective
Provide clear, versioned queue-specific moderation instructions and defensible QA scoring.

### Implementation
- `ModerationPolicy`, `PolicyVersion`, `PolicyTag`, `PolicyClarification`, and acknowledgment/change logs as needed.
- Each tag has a stable code, definition, selection conditions, exclusion conditions, evidence requirements, examples and allowed combinations.
- Policies and review forms are associated with queue/version; completed decisions reference the effective policy version at time of submission.
- Moderator policy page: searchable, accessible, organized by subscribed/allowed queue; contextual help embedded in Moderate and View modes.
- Authorized Admins/managers may propose or edit policies within delegated scope; define explicit approval/publish authority and audit revisions.
- Policy updates must not retroactively change how historical QA decisions are interpreted.

### Acceptance gate
- Moderator can find correct tag guidance during a case.
- Policy versions are immutable after publication and linked to decisions.
- Unauthorized employees cannot edit or publish policies.
- QA sees policy effective at original review time.

---

## 9. Phase 9 — Workforce and executive dashboards

### Objective
Complete role-specific management across the organizational hierarchy.

### Implementation
- **Super Admin:** platform-wide organizations, LOB creation/assignment, queues, delegations, staff, audit, operational metrics and configuration.
- **Organization Admin (Director):** exactly one organization; assigned LOBs, teams, queues (only with delegated creation/configuration), staff role assignments, AUX, productivity, QA and organizational KPIs.
- **Manager:** assigned teams and LOB operations, supervisor performance, individual moderation and QA KPIs, AUX and staffing.
- **Mod Supervisor (TL):** assigned moderation teams, live queue activity, moderator case counts, AHT_seconds, AUX, Submit & Leave behavior and coaching needs.
- **QA Supervisor (TL):** QA team workload, samples, scoring, accuracy, errors, reopen progress and reviewer performance.
- **Moderator:** subscribed queues, continuous Moderate mode, personal performance, AUX and policies.
- **QA Reviewer:** quality sampling/review workspace, assigned scopes, QA performance and policies.
- Use consistent server-authorized filters for organization → LOB → team → employee → queue; no role should obtain extra data by editing client parameters.
- Add clear empty states, export auditing, live data refresh and operational alerting where justified.

### Acceptance gate
- Every role sees correct navigation and authorized data; direct API requests enforce identical boundaries.
- Cross-LOB team reporting works only for authorized managers/supervisors.
- Organization Admin cannot access other organizations or create new LOBs.
- AHT remains in seconds in every view/export.

---

## 10. Phase 10 — Security, migration validation and full end-to-end testing

### Objective
Prove the corrected system works in real browsers and API integration tests without breaking Flutter discovery.

### Test matrix
1. Identity/session isolation among ordinary users, super admins and moderation staff.
2. Organization and single-LOB staff constraints, including reassignment and revoked access.
3. Queue creation delegation and LOB-level access; self-subscription validation.
4. Genuine search-driven and user-report intake, no duplicate case floods or unrelated geographic crawling.
5. Six AUX states, transitions, active-case lock and attendance seconds.
6. Strict random pending-case selection, no collision under parallel workers, lease expiry and crash recovery.
7. Continuous Submit, next-case delivery, Submit & Leave, duplicate requests and same-route UI transitions.
8. View mode read-only and no productivity effects.
9. Case handling timer and AHT_seconds weighted aggregation, zero-case handling and remoderation accounting.
10. Moderator decision immediate publication, independent-evidence requirements and Google Places policy constraints.
11. QA random sampling, manual inspection, error attribution, reopen and effective-decision retention until correction.
12. Policy/tag versioning and QA scoring against historical policy.
13. Real-time queue and role-specific dashboards with server-side data scoping.
14. React Playwright tests for moderator, QA, supervisor, manager, Admin and Super Admin workflows.
15. Backend test suite, TypeScript checks, Vite build, Flutter analyze/test and real device smoke tests where available.
16. Proper Prisma migrations, backup/rollback drill, audit integrity and secrets/privacy review.

### Full acceptance scenario
1. Super Admin creates Organization A and LOB `ABC`, assigns LOB to Organization A.
2. Super Admin delegates queue creation to Organization A Admin.
3. Admin creates `User Reported Cases`, configures user-report routing and grants LOB `ABC` access.
4. Admin provisions a moderator, QA reviewer, manager and supervisors, each in exactly one org/LOB; teams are assigned by authorized uplines.
5. Flutter user reports a parking issue; exactly one eligible pending case appears in queue.
6. Moderator self-subscribes, sets AUX `MODERATING`, sees live pending count and selects **View**; confirm no mutation.
7. Moderator selects **Moderate**; one random pending case is atomically reserved; AUX controls lock and timer begins in seconds.
8. A second moderator cannot receive the same case; run concurrent request test.
9. First moderator applies policy tags, presses **Submit**; effective decision updates immediately, handling seconds saved and next case appears on same route.
10. Repeat for multiple cases, then **Submit & Leave**; final decision saves, session ends, leave count increments, AUX unlocks.
11. Queue, moderator, supervisor and manager dashboards reflect case counts, weighted AHT_seconds and AUX time.
12. QA samples a completed case, finds an error, attributes it to original moderator and reopens it.
13. Original effective decision remains until a new moderator submits a corrected decision; full decision/QA history is retained.
14. Verify organization/LOB boundaries, revoked access, evidence requirements, audits and Flutter regression behavior.

### Completion requirements
- Actual commands, exit codes, test counts, screenshots or Playwright traces and explicit limitations.
- No claim of production readiness based only on builds or unit tests.
- No synthetic evidence published as real parking verification.
- No unresolved critical identity, privacy, concurrency or publication issue.

---

## 11. Recommended implementation cadence and deliverables

| Phase | Name | Dependency | Required proof |
|---|---|---|---|
| 1 | Organizations & LOBs | Existing identity architecture | Schema, migrations, role/org tests |
| 2 | Queues & subscriptions | 1 | LOB access tests, live queue worklist |
| 3 | AUX & attendance | 1 | Transition/lock tests, AUX history |
| 4 | Continuous engine | 2–3 | Concurrent random allocation and idempotency tests |
| 5 | Moderator workspace | 4 | Playwright Submit/Leave/View workflows |
| 6 | Metrics & AHT | 3–5 | Weighted seconds calculations, dashboards |
| 7 | QA & remoderation | 4, 6 | Sample/error/reopen/version tests |
| 8 | Policies & tags | 2, 5, 7 | Policy version and clarification tests |
| 9 | Management dashboards | 1–8 | Scoped hierarchy/performance E2E |
| 10 | Full acceptance | 1–9 | Full regression and operational report |

For **each phase**, coding agent must: (a) inspect repository, (b) list exact changes, (c) implement with safe migration, (d) run focused tests and relevant regressions, (e) update docs, (f) report commands/results/limitations, (g) stop at phase gate if critical issues remain.

### Suggested agent instruction

> Read `docs/PRAKARO_MILESTONE_14_ALL_PHASES.md` completely. Treat its authoritative rules as the product contract. Audit the existing repository before modifying code. Implement Phase 1 first, with safe Prisma migrations and tests. Do not proceed to Phase 2 until Phase 1's acceptance gate passes. Repeat sequentially through Phase 10, preserving existing Flutter discovery, three-domain authentication, search-driven intake and independent evidence standards. AHT is **always in seconds**. Do not invent successful tests, policy compliance or production readiness.

---

## 12. Open engineering details to resolve during implementation

These are **implementation decisions**, not permission to change the agreed product behavior:

- How LOB reassignment and organizational moves affect historical metrics, staff permissions and existing subscriptions. Preserve time-based attribution.
- Which queue ownership model is used if Super Admin grants an LOB to an organization and a queue is shared across organizations. Default to explicit scoped grants and no implicit cross-org visibility.
- Uniform random selection algorithm at production scale; prove non-collision and quantify sampling fairness without expensive full-table random sorts where possible.
- Case lease/heartbeat length and browser-disconnect recovery, without counting abandoned cases as completed handling.
- Safe release reasons and whether repeated release behavior warrants separate monitoring; it is distinct from Submit & Leave.
- QA sample-rate settings, QA sampling eligibility, policy for repeat samples and error severity. Original decision stays until corrected under the agreed normal flow; exceptional legal/safety takedown requires separately authorized policy.
- Exact attendance definition of login time, Offline AUX, session disconnect and paid working time; don't conflate them.
- Permission delegation model for Admin queue creation and policy publication, with revocation and audit.

**Non-negotiable:** Do not revert to mandatory QA approval, individual queue grants, a global Cases page, minute-based AHT, or multi-LOB membership per employee.
