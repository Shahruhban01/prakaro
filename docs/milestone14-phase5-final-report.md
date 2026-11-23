# Prakaro Milestone 14 Phase 5

The continuous workspace now shows case evidence, its source, saved policy guidance, the versioned review form, the case clock in seconds and the session total. The top-right AUX clock uses attendance timestamps and remains visible on desktop and mobile.

Submit and auto-next use the existing transactional endpoint. A successful submit keeps the route and session, updates the count, and replaces the case and draft. Submit & Leave completes and ends the session. Safe release confirms the moderator’s intent before releasing and ending the session without a decision. Refresh restores a valid lease. Temporary failures preserve the in-page draft. The server rejects stale decisions and returns the original result when an identical request retries. Each reservation can publish one decision.

The backend scopes active-case reads and validates the saved form, selected evidence and publication. Independently supported approvals use the existing verification publication policy. Queue selection stays random and uses the existing reservation constraints. No Prisma schema changes were needed.

## Files

- The route is wired in `QueueOperations.tsx`. `ModerateSession.tsx` re-exports the workspace, and `components/continuous/` contains the workspace, lease hook, review form, evidence panel, contracts, and styles.
- `Layout.tsx`, `GlobalAuxControl.tsx`, `attendanceApi.ts`, and `workforce.css` share and display the authoritative AUX snapshot. `FormBuilder.tsx` configures reason-tag choices in the existing queue settings.
- `continuous-engine.ts`, `continuous-routes.ts`, and `config.ts` provide scoped session reads, lease renewal, saved-form validation, safe decision replay, and evidence-backed publication.
- `continuous-moderation.test.ts`, `ContinuousModeration.test.tsx`, `FormBuilder.test.tsx`, and `moderate.spec.ts` exercise the API, UI, and complete browser workflow.
- The architecture, design, inventory, accessibility, and test notes accompany this report.

## Screenshots

- [Desktop workspace](milestone14-phase5-screenshots/desktop-workspace.png)
- [Evidence panel](milestone14-phase5-screenshots/evidence-panel.png)
- [Policy tags and decision](milestone14-phase5-screenshots/policy-and-decision.png)
- [Sticky action bar](milestone14-phase5-screenshots/sticky-action-bar.png)
- [Submission in progress](milestone14-phase5-screenshots/submit-loading.png)
- [Empty queue](milestone14-phase5-screenshots/empty-queue.png)
- [Expired lease](milestone14-phase5-screenshots/lease-expired.png)
- [Mobile workspace](milestone14-phase5-screenshots/mobile-workspace.png)
- [Locked AUX](milestone14-phase5-screenshots/aux-locked.png)
- [Completed session](milestone14-phase5-screenshots/completed-session.png)

## Boundaries

The existing API supplies evidence references and review history. Authorized photo attachments and case-scoped AI recommendations are unavailable in the current workspace response. The viewer handles typed same-origin media references, missing or broken images, and keyboard inspection when such records are supplied. Browser screenshots use synthetic material. Draft text survives recoverable in-page connection failures. A full page refresh restores the server reservation and elapsed time.

## Regression results and Phase 6

The API build passed, the API suite passed all 116 tests, React passed all 37 tests, Edge passed all four browser scenarios, and Flutter passed all 125 tests with clean analysis. The Phase 5 API files pass targeted lint. Repository-wide API lint reports 29 existing errors outside those files. See the [verification log](milestone14-phase5-testing.md) for commands and results.

The implementation is ready as the development baseline for Phase 6. Production sign-off should track the inherited lint debt and separately verify any planned authorized-media workflow.
