# Milestone 14 Phase 6 architecture

The React console keeps its authenticated workforce layout. Operations, personal performance, teams, LOBs, organizations, queues and workforce views share one report shape. The layout continues to own top-right AUX and its clock.

Fastify authenticates through the existing staff resolver. The report derives its directory, workforce scope, shared backlog scope, UTC reporting window and accepted handling records on the server. It reads a consistent database snapshot and sends counts, duration statistics and paged rows. Browser requests carry role, actor and tenant in their TanStack Query keys. A visible report polls every 20 seconds, cancels superseded requests and refreshes after reconnect. A successful continuous submission invalidates analytics queries.

Processing components are under `apps/api/src/modules/moderation/analytics*`. `handling-metrics.ts` provides the shared accepted-handling predicate, weighted mean and duration distribution. `Analytics.tsx` and `components/analytics/` provide page controls, presentation and chart data summaries. The Phase 4 allocator and Flutter UI remain in place.

The pre-change checkout contained Phase 5. The API and React baseline passed 116 and 37 tests respectively. Flutter passed analysis and 125 tests. The browser regression included the Phase 1–5 scenarios.
