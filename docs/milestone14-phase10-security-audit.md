# Phase 10 security audit

The repository was audited on master with Phases 1–9 staged. The review covered Fastify registration, environment and Prisma configuration, three Better Auth models, console route guards, package lockfiles, all migration directories, and the existing authorization and operational test suites.

| Severity | Finding | Disposition |
| --- | --- | --- |
| High | Authentication URL construction accepted incoming routing headers. The production origin allowlist included development hosts and the environment could fall back to a development secret. | Authentication now uses the configured HTTPS origin and replaces forwarding and client-address headers before calling Better Auth. Startup rejects default signing credentials and root or passwordless database credentials in production. |
| High | npm reported three API findings and four console findings, including two critical development-tool dependencies. | Upgraded Fastify with its plugins, Zod and Vitest. Public npm advisory reruns returned zero for both lockfiles. |
| High | The release deployment document used schema synchronization. Native MySQL rejected an existing attendance constraint during canonical migration replay. | Replaced schema synchronization with canonical `prisma migrate deploy`. Decoupled cascading foreign key columns from CHECK constraints, resolving MySQL Error 3823. Applied all 11 migrations natively with zero errors and zero drift. |
| Medium | Staff requests could reuse legacy browser-stored bearer material. Expiration redirected without purging all cached scope data. | Console requests use domain cookies. The session guard purges the cache when a session expires. |
| Medium | Request/error logs included path identifiers, networking metadata or raw exception objects. | Request logs use route templates and generated IDs. Unexpected errors log only the error class, route and correlation. |
| Medium | Missing readiness and deployment header configuration. | Added a bounded database probe and a static console proxy configuration with CSP and frame protection. |
| Release prerequisite | Single-node rate counters, operator-managed privileged recovery, and hosting headers need staging validation. | The runbook requires an edge limiter, defined privileged recovery, and staging verification before enabling traffic. |

Better Auth separates account, session and verification tables and cookie names by identity domain. Staff self-registration remains disabled. Browser requests use secure host cookies in HTTPS. Session lookup is database-backed. Bearer support remains for existing non-browser callers. Release credentials require a separate injection and backup policy. The change does not add MFA or a new recovery channel.

The authorization regression suites cover cross-tenant staff, queues, reservations, attendance, QA, policy, workforce scheduling and report export. Verified publication still requires independent evidence. No additional authorization mechanism was added to the allocator.

The local secret signature scan found zero tracked environment or private-key files, zero working files matching the selected credential patterns, and zero matching commits in the available history. It checked PEM, Google API key, OpenRouter and GitHub token signatures. These checks are scoped to the local clone and selected patterns.

Production route limits are scoped by request route and verified client address unless an existing endpoint uses a stricter authenticated identifier. The defaults are 10 authentication writes per minute, five recovery attempts, 30 session-ending writes, 40 allocation or decision writes, 10 policy publications and CSV exports, and 180 dashboard reads on named families. Better Auth can impose an earlier limit. The process-local counters require ingress controls for shared-network and multi-instance deployments. Development and test authentication writes allow 60 attempts per minute so the test suite can sign in as multiple fixture identities.

[Npm advisory references](https://github.com/advisories) · [Better Auth security documentation](https://better-auth.com/docs/reference/security)
