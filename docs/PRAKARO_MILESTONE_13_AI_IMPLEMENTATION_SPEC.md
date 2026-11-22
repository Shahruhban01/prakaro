# PRAKARO — MILESTONE 13
## Search-Driven Parking Verification & Human Moderation Platform

**Document type:** AI coding-agent implementation specification  
**Status:** Implementation instructions; not a claim of completed work  
**Primary stack:** React.js + Vite + TypeScript; existing Fastify + MySQL/Prisma; Flutter  
**Scope:** New moderation console, search-driven intake, configurable queues, AI triage, human verification, QA, publication, mobile integration

> **Agent directive:** Audit the actual repository first. Implement and test working vertical slices. Never substitute mock UI, invented evidence, or simulated success for a real integration. Do not use Next.js.

---

## 1. Mission and product invariants

Prakaro is an Android-first parking discovery application. Milestone 13 creates an operational trust-and-safety platform for reviewing parking facilities that users actually encounter through Prakaro searches. Human moderators must be able to assess independent evidence, record nuanced decisions, and publish supported verification attributes back to the mobile app.

### Non-negotiable invariants

1. **Search-driven admission:** A new facility is eligible for discovery-based moderation only if returned by a genuine user-initiated parking discovery request. Never crawl random locations to populate moderation queues.
2. **No duplicate work:** Repeated searches, retries, UI rebuilds, and multiple queue matches must not produce duplicate active cases for the same facility and review scope.
3. **No discovery regression:** Moderation and AI run asynchronously and must not delay or break parking discovery.
4. **No invented facts:** AI suggestions and Google Places categories do not constitute independent proof of existence, access, pricing, or hours.
5. **Evidence-backed publication:** Only independently supported, appropriately reviewed attributes may be published as verified. Unknown remains unknown.
6. **Provider compliance:** Respect Google Maps Platform terms and AI provider data-use restrictions. Do not assume third-party Places content can be persisted or sent to external models.
7. **Backend authority:** Fastify owns authentication enforcement, authorization, moderation logic, queue routing, assignment, AI integration, decisions, publication, and audit logs. React is a client, not a second backend.
8. **Real security:** Every API action requires server-side authorization; hiding a UI control is not permission enforcement.
9. **Safe defaults:** No paid AI fallback without explicit authorization. No AI-only removal or verified label. No automatic bulk intake without budgets.
10. **Honest reporting:** Distinguish implemented, tested, live-tested, synthetic, blocked, and unimplemented features.

## 2. Existing system and mandatory audit

Expected monorepo:

```text
apps/mobile/       Flutter + Riverpod 3 + Dio + Google Maps
apps/api/          Node.js + TypeScript + Fastify + Zod
apps/moderation/   NEW: React.js + Vite + TypeScript
packages/          Optional shared API contracts
```

Existing backend is expected to use MySQL, Prisma, Better Auth, Google Places API (New), cost/rate controls, and Prakaro Intelligence rules and shadow-mode AI evaluation. Earlier work reportedly introduced **All Candidates**, **Recommended**, and **Verified Only** discovery modes. The prior Gemini 2.5 Flash-Lite generation attempt returned model unavailable; do not assume any particular replacement model works.

**Before editing:** inspect package manager/workspace config, auth/session strategy, API routes, existing Prisma models/migrations, facility identity strategy, intelligence evaluation and budget code, feature flags, discovery request flows, Flutter models and tests. Document actual findings and deviations. Reuse existing tables and services rather than creating parallel verification systems. Inspect whether development schema changes were applied using `prisma db push`; create a safe migration baseline/plan without overwriting real data.

## 3. Technology decisions

| Layer | Required choice | Responsibility |
|---|---|---|
| Web app | React.js + Vite + TypeScript | Moderation console |
| Routing | React Router | Client routes, guarded UX |
| Design | Tailwind CSS + shadcn/ui + Radix UI | Accessible, original enterprise UI |
| Icons | Lucide React | Consistent iconography |
| API state | TanStack Query + Axios | Cache, invalidation, requests |
| UI state | Zustand | Local workbench state only |
| Tables | TanStack Table | Sorting, filtering, selection |
| Forms | React Hook Form + Zod | Queue forms, review forms |
| Charts | Recharts | Real analytics |
| API | Existing Fastify + TypeScript + Zod | Business logic and policy |
| Authentication | Existing Better Auth | Sessions and roles |
| Persistence | Existing MySQL + Prisma | Cases, evidence, queues, audit |
| AI | Existing rules + working Gemini + permitted OpenRouter free fallback | Advisory triage only |
| Mobile | Existing Flutter + Riverpod + Dio | Verification display and reports |
| Tests | Vitest, React Testing Library, Playwright, existing API/Flutter tests | Full workflow validation |

Do **not** introduce Next.js, a second authentication database, a separate moderation API, or Redis/Kafka without a documented operational need.

## 4. Target architecture and trust boundaries

```text
Flutter user search
   |
   v
Existing Fastify discovery endpoint -----> User gets normal parking response
   |
   +-- sanitized, bounded, durable discovery event (non-blocking)
             |
             v
      Intake eligibility + dedupe + budget
             |
             v
      Case creation + deterministic queue routing
             |
       +-----+--------------------+
       |                          |
       v                          v
 Rules / permitted AI triage   Human moderation queue
       |                          |
       +------ uncertainty ------>|
                                  v
                        Human review + evidence
                                  |
                           QA / supervisor gate
                                  |
                                  v
                       Versioned publication
                                  |
                                  v
                         Flutter verification UI

React/Vite console <-- authenticated Fastify moderation API --> MySQL/Prisma
```

Never expose provider keys, database credentials, or privileged service tokens to the Vite bundle. Model output, uploaded documents, and user reports are untrusted inputs.

## 5. Search-driven intake: precise contract

### Eligible triggers

- Explicit initial nearby parking discovery.
- Explicit destination parking search.
- Explicit **Search This Area** request.
- Radius change **only when** it causes a genuine new backend discovery request.

### Ineligible triggers

- List/Map toggles, local filters, widget rebuilds, opening details, client-side sorting.
- Retries of the same request within the deduplication window.
- Health checks, internal probes, synthetic automated tests, background geographic sweeps.
- Scheduled scans of unrelated areas or speculative city-wide harvesting.

### Processing requirements

1. Discover candidates using existing production discovery logic; do not add searches for moderation.
2. Emit a **minimal event** referencing only candidates returned in that discovery response, using permitted stable identifiers and sanitized metadata.
3. Validate eligibility on the server; a client-provided `isGenuineSearch=true` is not sufficient.
4. Apply idempotency keys and a time-bounded replay/dedupe policy.
5. Use transactional case creation and outbox/job handling, with bounded retries and crash recovery.
6. Do not block the discovery response on moderation, queue processing, or AI.
7. Never create a case for a facility outside the actual returned candidate set.
8. Aggregate demand without persisting raw searcher GPS histories or exposing user identities to moderators.
9. Allow user reports, appeals, QA, and expiration-driven reverification of **previously admitted** facilities without requiring a new search.
10. Apply per-search and daily case budgets, queue capacity, priority, and backpressure.

**Example acceptance:** A Connaught Place search returns 20 candidates. Only those 20 can be admitted. Intake may select fewer based on policy. A repeated identical search cannot duplicate active cases. A Mumbai facility cannot be admitted by the Connaught Place event.

### Configurable intake modes

- `ALL_ELIGIBLE_SEARCH_CANDIDATES` (budgeted)
- `AI_RECOMMENDED_ONLY`
- `UNCONFIRMED_ONLY`
- `USER_REPORTS_ONLY` (for admitted facilities)
- `MANUAL_SELECTION` (admitted facilities only)
- `CUSTOM_RULES`

Default to conservative intake and disabled/unlimited-cost-resistant AI. Persist intake policy version and reason for every admission decision.

## 6. Roles, permissions, and sessions

Roles: `SUPER_ADMIN`, `ADMIN`, `MODERATION_MANAGER`, `SUPERVISOR`, `QA_REVIEWER`, `MODERATOR`, `VIEWER`.

Use existing Better Auth. Add role and queue-level authorization without duplicating user credentials. Design permissions as explicit actions such as `queue:create`, `queue:edit`, `case:view`, `case:claim`, `review:submit`, `qa:decide`, `verification:publish`, `ai:configure`, and `audit:read`. A moderator must only access permitted queues/cases/evidence; a read-only viewer cannot claim tasks. Restrict ordinary driver accounts from console access. Enforce permissions in every Fastify endpoint and evidence download, not just React routes.

Prefer secure HttpOnly session cookies with correct SameSite, CSRF, origin/CORS, proxy, and deployment-domain settings. Never put secrets in `VITE_*` variables or localStorage. Log auth-sensitive actions without logging credentials or tokens.

## 7. React moderation console: UX specification

Design an **original**, professional, light-first operational console: white/neutral surfaces, restrained blue accents, dense but readable tables, clear typography, accessible controls, responsive side navigation, keyboard focus states, loading/empty/error states, and honest live counts. No proprietary UI copying and no fake analytics.

### Required routes

```text
/login
/dashboard
/queues
/queues/new
/queues/:id
/queues/:id/settings
/cases
/cases/:id
/my-tasks
/qa
/escalations
/moderators
/analytics
/settings/ai
/settings/permissions
/audit-log
```

### Dashboard

Real metrics: pending/assigned/in-review/completed cases, unassigned work, overdue SLAs, QA pending, escalations, independently verified facilities, unconfirmed facilities, search-driven intake counts, queue throughput, reviewer workload, AI attempt/provider health, and provider cost/usage if actually known. Support date filters, role-appropriate views, and real empty states.

### Queue list and case tables

Server-side pagination/filter/sort. Configurable columns, default sort, saved filters, case priority, SLA countdown, queue membership, assigned moderator, AI triage reason, evidence readiness, and last review date. Server authorization controls which fields are returned; UI hiding is only presentation.

### Review workbench

Three-panel desktop layout (responsive on small screens):

1. **Context:** case ID, queue, facility reference, permitted map/location, status, timeline.
2. **Evidence:** independent photographs, operator documents, field inspection reports, timestamps, provenance, contradictions, prior reviews, access controls.
3. **Decision:** advisory AI assessment, versioned review form, required evidence links, reason codes, notes, save draft, approve supported attributes, reject unsupported claims, insufficient evidence, request evidence, escalate, submit to QA.

Include a keyboard-accessible “next task” workflow but never bypass mandatory review validations.

## 8. Configurable moderation queues

Each queue has an internal UUID and immutable, unique, human-readable ID (e.g., `QUEUE-AI-001`, `QUEUE-GEN-002`, `QUEUE-ACC-003`, `QUEUE-RPT-004`), name, description, type, status, priority, eligibility rules, assignment strategy, role/queue permissions, evidence requirements, form version, SLA, escalation rules, QA sampling rules, timestamps, and actor history. IDs must be generated atomically; do not derive uniqueness from an unsafe count query.

Support create, edit, pause, resume, archive, and duplicate configuration (with a **new** ID). Preserve historical configurations and audit records.

### Default queue templates

| Queue | Eligibility / purpose |
|---|---|
| AI Recommended Human Review | AI uncertainty, failure, contradictions, invalid output, insufficient evidence |
| General Parking Verification | Selected unconfirmed search-discovered facilities |
| Restricted Access Review | Private, permit-only, residential, customer-only, or unknown access |
| User Reports | Reports on admitted facilities: location, closure, pricing, access, not-parking |
| Reverification | Expired evidence or materially changed claims on admitted facilities |
| Escalations | Conflicts, disagreements, supervisor-required decisions |
| Quality Assurance | Sampled completed reviews and supervisor-requested audits |

### Visual rule builder

Support allowlisted conditions with nested AND/OR groups: admission status, verification status, facility classification, access, pricing, AI review reason, evidence quality, geographic region, aggregated search demand, case age, report type, previous decision, SLA, escalation status. Validate rule AST with Zod. **No arbitrary SQL, JavaScript, or user-supplied executable expressions.** Show estimated matching-case preview and rule version before saving. Route deterministically; explain each queue match.

### Configurable queue display and review forms

Admin selects visible columns, order, filters, sort, queue instructions, evidence sources and required fields. Forms support single/multi-select, Yes/No/Unknown, text, number, date, reason codes, notes, evidence references, conditional visibility, required fields, and versioning. Every review stores the exact form version. Unknown must be a valid answer where evidence is missing.

## 9. Cases, tasks, and assignment

**Facility:** the underlying permitted identity/reference.  
**Case:** a bounded review of a facility and verification scope.  
**Task:** an actionable work item in a case, possibly for different stages (moderation, QA, escalation).  
**Queue membership:** eligibility of a case/task for a queue; not a duplicate case.

Example IDs: `CASE-2026-000001`, `TASK-2026-000001`. Use internal UUIDs as primary keys and unique constraints for human-readable IDs.

States: `NEW`, `QUEUED`, `ASSIGNED`, `IN_REVIEW`, `AWAITING_EVIDENCE`, `ESCALATED`, `PENDING_QA`, `APPROVED`, `REJECTED`, `CLOSED`, `REOPENED`. Define a state-transition matrix, allowed actors, and transaction boundaries. Never allow invalid direct transitions.

Task categories:

- `NEW_FACILITY_VERIFICATION`
- `AI_UNCERTAIN_REVIEW`
- `SUSPECTED_NON_PARKING`
- `PUBLIC_ACCESS_VERIFICATION`
- `RESTRICTED_ACCESS_REVIEW`
- `PRICING_VERIFICATION`
- `LOCATION_VERIFICATION`
- `OPERATING_HOURS_REVIEW`
- `USER_REPORT_REVIEW`
- `REVERIFICATION`
- `SUPERVISOR_ESCALATION`
- `QUALITY_ASSURANCE`

Assignment strategies: manual, round-robin, least workload, skill/geographic expertise, priority. Implement atomic claim/lease or equivalent database-safe locking, expiration, recovery, and reassignment. Test concurrent claims. A task may match multiple queues, but a single reviewer claim must be globally coherent. Store assignment and transition histories.

## 10. Evidence and nuanced human decisions

Human reviewers evaluate **independent, authorized** evidence: field inspections, on-site photos with permission, official operator documentation, verified operator statements, or other lawful independent sources. Google Places metadata is not independent proof; AI summaries are not evidence. Remote review may end in **insufficient evidence**, and a field visit may be required.

Evaluate distinct claims:

| Dimension | Possible outcomes |
|---|---|
| Facility existence | Confirmed, contradicted, not confirmed, unknown |
| Access | Public, private, customers only, permit/restricted, unknown |
| Pricing | Free, paid, unknown |
| Hours | Supported, unsupported, unknown |
| Location/entrance | Supported, disputed, unknown |

A real private facility is not fake. A genuine facility with unknown pricing must not be labeled free. A moderator rejecting an unsupported pricing claim must not automatically reject facility existence. Decisions require evidence references, reviewer ID, reason codes, form version, timestamp, and optional expiry. Define independent reviewer/QA requirements for high-risk claims.

Evidence ingestion must validate file types, size, access, malware scanning where feasible, retention policy, source attribution, and immutable provenance metadata. Do not expose sensitive operator/user information unnecessarily.

## 11. AI provider architecture and fallback

AI is **advisory**. Preserve existing deterministic rules, feature flags, shadow behavior, shared daily budgets, and caching/deduplication. Implement provider adapters:

```text
GoogleGeminiProvider
OpenRouterProvider
DisabledOrRulesOnlyProvider
```

Suggested backend configuration (adapt to existing names):

```dotenv
AI_PROVIDER_PRIORITY=google,openrouter
GOOGLE_GEMINI_API_KEY=
GOOGLE_GEMINI_MODEL=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
AI_ENABLE_PROVIDER_FALLBACK=true
AI_ALLOW_PAID_MODELS=false
```

Preserve legacy `GEMINI_API_KEY` / `GEMINI_MODEL` compatibility if present. Do not log keys.

### Gemini availability

Discover models available to the **actual configured project**, verify generation and structured-output capabilities, quota, pricing, and API version, and execute a small **synthetic** generation smoke test. Previous `gemini-2.5-flash-lite` requests reportedly returned HTTP 404; do not hard-code an untested replacement or claim availability based only on model listing.

### OpenRouter fallback

If Gemini is unavailable, evaluate currently available **free** OpenRouter models via official model metadata and a synthetic smoke test. Endpoint: `https://openrouter.ai/api/v1/chat/completions`. Prefer a pinned, tested free model; verify zero price for the request and model capabilities, quota, output validation, and provider data-use policy. Never silently use a paid model or send restricted Places content/photos. Record the actual provider/model used; if unavailable, fall back to rules-only and route eligible uncertainty to human review.

### Unified assessment schema

Validate with Zod and reject unknown evidence references:

```json
{
  "facilityClassification": "UNCERTAIN",
  "accessClassification": "UNKNOWN",
  "pricingClassification": "UNKNOWN",
  "operatingInformation": "UNKNOWN",
  "evidenceIds": [],
  "contradictions": [],
  "missingEvidence": [],
  "reasonCodes": ["INSUFFICIENT_EVIDENCE"],
  "requiresHumanReview": true,
  "reviewReasons": ["INSUFFICIENT_EVIDENCE"]
}
```

Record provider, resolved model, schema/prompt version, request timestamp, duration, token usage if available, cost if verified, error category, and fallback reason. Model outputs are untrusted; do not execute model-proposed routing rules. Apply timeouts, bounded retries, circuit breakers, quota cooldown, rate limits, and queue backpressure. Do not re-run unchanged evidence on every app view.

## 12. Deterministic AI-to-human routing

Route eligible cases to review on uncertainty, insufficient/conflicting evidence, invalid model output, provider outage, suspicious rules findings, user reports, or expired verification. Queue eligibility is determined by versioned admin rules, not arbitrary AI instructions. AI outage must not create unlimited duplicate cases. Preserve a bounded rules-only path.

## 13. QA, escalation, and appeals

Implement configurable QA sampling, independent second reviews, supervisor overrides with reason, disagreement resolution, reviewer feedback, decision reversal, case reopening, and appeal linkage. Prevent a reviewer from QA-approving their own decision when independence is required. Track QA pass rate, agreement, overturned decisions, evidence completeness, and review turnaround; never optimize solely for throughput.

## 14. Publication and Flutter integration

Separate discovery candidates, cases, human decisions, and **published** verification records. Publication requires required evidence, authorized review/QA, a valid current claim, and a versioned audit event. Store independently supported existence/access/pricing/hours/location attributes with provenance, review time, expiry, and publication version. Expiry triggers reverification for already admitted facilities; stale claims should no longer appear as current verified facts.

In Flutter, preserve existing List/Map, Search This Area, radius, destination search, details, directions, and All Candidates/Recommended/Verified Only behavior. Display accurate states such as **Verified parking**, **Unconfirmed**, **Restricted access**, and **Under review** where supported, plus last verified date. List and Map must agree. Never show “Verified” from AI alone.

Add **Report incorrect information** with categories: not a parking facility, private/restricted, wrong location, incorrect price, incorrect hours, closed, other. Reports create or update cases for already admitted facilities; they do not publish facts automatically. Apply spam and abuse controls.

## 15. Prisma model design and migration discipline

Inspect and reuse existing models. Candidate additions, only where needed:

```text
ModerationQueue
QueueRuleVersion
QueueMembership
ModerationCase
ModerationTask
CaseAssignment
ReviewForm
ReviewFormVersion
ReviewSubmission
ReviewDecision
VerificationEvidence
CaseEvidenceLink
QualityReview
Escalation
ModeratorQueuePermission
ModerationAuditEvent
AiProviderAttempt
PublishedVerification
SearchIntakeEvent / IntakeOutbox
SearchDemandAggregate
ModerationIntakePolicy
```

Specify unique constraints for human IDs, case active-scope dedupe, outbox event idempotency, and task claim coherence. Index queue/status/priority, assignment, facility/scope, intake time, and verification expiry. Use transactions for claim, routing, review transition, and publication. Avoid destructive `db push` on production. Create reviewable Prisma migrations and a rollback/recovery plan. Test against disposable MySQL before applying to existing development data.

## 16. API contract and error behavior

Implement authorized, versioned REST resources under:

```text
/api/v1/moderation/queues
/api/v1/moderation/cases
/api/v1/moderation/tasks
/api/v1/moderation/assignments
/api/v1/moderation/reviews
/api/v1/moderation/qa
/api/v1/moderation/escalations
/api/v1/moderation/analytics
/api/v1/moderation/moderators
/api/v1/moderation/ai/providers
/api/v1/moderation/intake-policies
/api/v1/moderation/audit-log
```

Provide server pagination, filtering, sorting, Zod validation, stable error codes, idempotency, optimistic concurrency/version checks, rate limiting, audit events, and documented response schemas. Reject unauthorized cross-queue access and stale review submissions. Keep public Flutter endpoints free from privileged moderation data.

## 17. Audit, security, privacy, and compliance

Audit queue/rule/form changes, case admission, routing, claim, reassignment, evidence, AI attempts, human decisions, QA, escalation, overrides, publication, and reopening. Include actor, action, target, time, old/new state, reason, and policy version. Protect audit integrity and access. Never log passwords, session tokens, AI keys, raw private user locations, or restricted third-party content.

Security test cases: CSRF, CORS, session expiry, horizontal privilege escalation, queue-level IDOR, evidence URL leakage, unsafe uploads, prompt injection, malicious queue expressions, duplicate submissions, concurrency, excessive intake, and provider-cost abuse. Apply data retention/minimization and legal/provider compliance review before production launch.

## 18. Implementation phases and deliverables

### Phase A — Audit and foundation

- Repository and schema audit, migration plan, feature flags.
- Better Auth roles/permissions and test accounts.
- Search-driven intake/outbox, budgets, idempotency, demand aggregation.
- Case/task/queue models, lifecycle, routing, concurrency tests.

**Gate:** A genuine discovery event admits only its returned eligible candidates; repeated events do not duplicate active cases; existing discovery remains unaffected.

### Phase B — React/Vite console

- Vite application, session integration, layouts, routing.
- Real dashboard, queues, rule builder, queue columns, forms.
- Cases, My Tasks, atomic claiming, evidence workbench.

**Gate:** Admin creates a custom queue; authorized moderator can claim and review an eligible case; unauthorized access is blocked.

### Phase C — AI providers and routing

- Provider abstraction and availability checks.
- Gemini synthetic smoke test; OpenRouter free fallback if permitted.
- Strict schema, budgets, uncertainty routing, provider status UI.

**Gate:** AI failure cannot break discovery, incur unauthorized paid charges, or create duplicate/unbounded cases.

### Phase D — QA, publication, Flutter

- Evidence validation, review decisions, QA, escalation, audit.
- Published verification records and expiry.
- Flutter labels and user reports, regression tests.

**Gate:** Evidence-backed, QA-approved synthetic test case publishes a versioned record visible consistently in Flutter.

### Phase E — Verification and operations

- Backend and web tests, Flutter tests, Playwright E2E.
- Security/privacy/provider-compliance review.
- Development deployment, migrations, rollback, observability.

**Gate:** All required acceptance tests pass and remaining blockers are disclosed.

## 19. Mandatory automated test matrix

1. Better Auth session validation and role authorization.
2. Queue-level isolation and evidence access.
3. Unique atomic queue/case/task IDs.
4. Queue CRUD, archive, rule versioning, nested AND/OR validation.
5. Queue preview and custom column/form configuration.
6. Genuine user search intake; non-search UI actions excluded.
7. Candidate-set boundary: no unrelated geographic facility admission.
8. Retry/replay/idempotency and same-facility active-case dedupe.
9. Demand aggregation abuse resistance and intake budgets.
10. Multiple queue matches without duplicate cases.
11. Concurrent task claims, lease expiry, reassignment.
12. Case transition matrix and optimistic concurrency.
13. Required evidence and unknown-state handling.
14. Reviewer independence, QA sampling, escalations, reversals.
15. Gemini unavailable and synthetic model-discovery tests.
16. OpenRouter free-only enforcement, invalid JSON, provider outage.
17. Restricted content cannot be sent to unapproved AI providers.
18. AI uncertainty routing and backpressure.
19. Publication provenance, expiry, and rollback.
20. Flutter List/Map consistency and user-report flow.
21. Existing parking discovery and intelligence regressions.
22. No secret leakage in web bundle, logs, or responses.

Use mocked providers for deterministic CI tests, disposable MySQL for destructive integration tests, and clearly labeled synthetic evidence. A real AI model smoke test requires valid credentials and must report actual outcomes; never claim success from a mock.

## 20. End-to-end acceptance scenario

1. Admin signs in to React/Vite console.
2. Admin creates `QUEUE-AI-001` or another uniquely generated queue.
3. Admin defines eligibility rules, displayed columns, review form, and moderator assignment.
4. Flutter user searches Connaught Place with an explicit backend discovery request.
5. Backend returns candidates normally; bounded asynchronous intake selects only returned eligible candidates.
6. Case/task appears in appropriate queue; repeat search creates no duplicate active case.
7. Authorized moderator claims task; another moderator cannot claim simultaneously.
8. AI returns validated advice or an explicit uncertainty/failure; neither is published as truth.
9. Moderator examines authorized independent evidence, records existence/access/pricing separately, and submits a decision.
10. QA/supervisor reviews if policy requires; audit history is complete.
11. Publication service emits supported, versioned verification attributes.
12. Flutter List, Map, and Details show the correct current state.
13. A user report creates a follow-up case for the admitted facility.
14. A search in another area cannot create cases for unrelated facilities.
15. Provider failure, moderation backlog, and console downtime do not break user discovery.

## 21. Definition of done

- [ ] React.js + Vite console works with real Fastify APIs; **no Next.js**.
- [ ] Better Auth and backend role/queue permissions enforced.
- [ ] Admins create unique-ID queues, nested rules, display configs, forms, and assignments.
- [ ] Search-driven intake only admits actual returned candidates, with privacy and budgets.
- [ ] Duplicate searches do not create duplicate active cases.
- [ ] Moderators claim, review, and document independent evidence.
- [ ] AI provider discovery/fallback is actually tested or accurately marked blocked.
- [ ] No unauthorized paid AI usage or restricted-content transmission.
- [ ] QA, escalation, correction, audit, and expiry operate correctly.
- [ ] Evidence-backed publication updates Flutter consistently.
- [ ] User reports and existing discovery modes continue working.
- [ ] Migrations, tests, security checks, and E2E demonstration are documented.

## 22. Required agent final report

Report: repository audit; architectural decisions; changed files; schema migrations; feature flags; routes/screens; auth and queue permissions; intake event design; dedupe/budget evidence; queue rule and form builder; assignment concurrency; review/QA/publication workflow; actual Gemini model discovery and smoke results; actual OpenRouter model/price/quota results; Flutter integration; exact test commands/results; E2E evidence; security/compliance issues; deployment and rollback instructions; incomplete features and blockers. Explicitly label mock/synthetic demonstrations.

## 23. Suggested repository documentation files

```text
docs/moderation-architecture.md
docs/moderation-search-intake.md
docs/moderation-queues.md
docs/moderation-review-policy.md
docs/moderation-roles.md
docs/moderation-ai-providers.md
docs/moderation-deployment.md
docs/moderation-evaluation.md
```

## Final instruction to the coding agent

**Implement the complete working Milestone 13 in the existing Prakaro repository, using React.js + Vite + TypeScript for the moderation console and the existing Fastify/MySQL/Prisma/Better Auth/Flutter stack.** Search-driven admission is mandatory: do not create discovery-based moderation tasks for facilities that were not returned by genuine user searches. Keep AI advisory and budgeted, require independent evidence for verification, and demonstrate the complete admin → queue → search → case → moderator → QA → publication → Flutter workflow. Do not declare completion without executed tests and an honest limitations report.
