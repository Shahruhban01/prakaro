# Milestone 14 Phase 2 implementation report

## Audit and implementation

Phase 1 had separate Better Auth identities, organization and LOB membership, workforce teams, and delegated queue configuration. It still used direct staff-to-queue grants. Search and report intake routed only to legacy unowned queues and could put the same case in several queues. The old case workbench offered direct claim and submit actions without persisted AUX.

- Prisma adds LOB grants, moderator subscriptions, queue configuration snapshots, intake configuration and indexes. The historical membership and case tables remain intact.
- Fastify now uses LOB grants and queue ownership for reads, validates delegation and foreign-organization boundaries for writes, and rejects old direct grants and case mutations.
- Search and report intake keep canonical active-case deduplication and route new work to one queue. Reports that cannot route are retained for follow-up in the restricted audit log.
- React adds Available Queues, My Subscribed Queues, a queue dashboard, scoped case filtering, read-only evidence and report inspection, and a Moderate prerequisites page. The global AUX header and existing workforce shell are reused.
- Queue settings reuse the existing condition and form editors and add ownership, LOB grant selection, policy text, intake controls, and configuration history.

## Main files

| Area | Files |
| --- | --- |
| Database | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261122030000_queue_operations/migration.sql` |
| Fastify | `apps/api/src/modules/moderation/queue-operations.ts`, `routes.ts`, `intake.ts`, `config.ts`, `setup.ts` |
| React | `apps/moderation/src/pages/QueueOperations.tsx`, `QueueSettings.tsx`, `App.tsx`, `components/Layout.tsx`, `components/RuleEditor.tsx` |
| Tests | Backend moderation, identity and workforce suites, `apps/moderation/src/__tests__/QueueOperations.test.tsx`, `apps/moderation/e2e/queues.spec.ts` |

## Run locally

Set the API database connection to a dedicated development schema. Set `MODERATION_ORIGIN=http://127.0.0.1:5173` in the API environment.

```powershell
npm --prefix apps/api run db:deploy
npm --prefix apps/api run db:generate
npm run api:dev
```

In a second terminal:

```powershell
npm --prefix apps/moderation run dev
```

Open `http://127.0.0.1:5173`. Use the existing [platform bootstrap instructions](milestone14-phase1-final-report.md) if the validation database has no Super Admin. Create an organization, assign an LOB, and provision a moderator. Enable incoming cases explicitly on an owned queue and grant it to the LOB. Sign in as the moderator and subscribe on Available Queues.

## Deployment boundaries

Validation used isolated MariaDB databases. The configured deployment database was left in its prior schema. Review the legacy workforce mapping and queue ownership before deployment. Phase 1's repository-wide lint backlog remains. The Windows Prisma DLL replacement lock recurred during generation, while the generated client and existing native engine worked during validation.

AUX remains unavailable. The read-only case view uses real queue data, while the Moderate prerequisites page and API deny operational case entry until the required phases. AHT is returned as null in a seconds-based field. See the [test evidence](milestone14-phase2-testing.md) and [database instructions](milestone14-phase2-database.md).

