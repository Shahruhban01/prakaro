# Phase 8 architecture

The Fastify moderation module owns policy configuration, publication, assignment resolution, decision validation and clarifications. React uses the existing authenticated application shell, API client, TanStack Query and React Hook Form. Policy validation is shared with the console through a pure Zod contract. The same Better Auth identity domains, organization membership, queue grants and global AUX apply.

Publishing advances a policy’s active scopes in one transaction. The existing random allocator selects a case first, then attaches the version effective for the reservation’s organization, LOB and queue. The same version remains attached through refresh, reconnect, heartbeats and submission. Existing reservations with no pin still use their saved task form. QA reads the original immutable policy document and compares its ID against the current assignment when available.

The user-facing routes are `/policies`, `/policies/new`, policy details with version, comparison, assignment and audit views, and `/clarifications`. Current guidance is also available in subscribed queue View and Moderate. Fastify exposes authenticated API resources below `/api/v1/moderation`.

Coverage includes org administration, current guidance, version preview, structured comparison, clarification inbox and historical QA. Flutter and the random allocation, handling duration, attendance and parking publication services retain their previous entry points.
