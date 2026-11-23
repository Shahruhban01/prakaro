# Phase 9 architecture

Phase 9 extends the existing Fastify workforce and moderation API groups. It uses Better Auth staff identities and the existing organization, LOB, team, queue, attendance, reservation, handling and QA records. The console adds a lazy-loaded workforce operations section inside the existing AppShell.

`operations/schedule.ts` owns scheduling, comparisons and time rules. `attendance.ts` combines planned occurrences with attendance and active reservations. `capacity.ts` builds historical demand and staffing estimates. `executive.ts` reads authoritative operational metrics. `alerts.ts` evaluates bounded due rules. `routes.ts` joins these to authorized API routes and CSV exports.

The additive migration `20261123030000_workforce_operations` adds shift definitions, frozen schedule occurrences, organization capacity assumptions, alert rules and events, and organization reporting timezone. It preserves existing records. Apply the migration before the new API starts. Data is stored in UTC with the source timezone and local shift date. The moderation allocator, decision publication, QA sampling and policy pinning still use their prior workflows.
