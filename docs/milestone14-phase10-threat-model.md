# Phase 10 threat model

Trust boundaries include the public mobile API, the staff browser and reverse proxy, the independent Better Auth identity stores, organization and LOB partitions inside Fastify, and the databases and external AI providers. Protected assets include session credentials, employee attendance, report evidence, audit events, policy versions, and published verification.

| STRIDE | Threat | Existing or implemented control | Residual severity |
| --- | --- | --- | --- |
| Spoofing | Public user or stolen staff session attempts privileged access | Identity tables and cookie names are separate. Staff revalidation uses the database. Console credentials are never read from browser storage. | High until staging confirms privileged recovery and edge controls |
| Tampering | Moderator replays a decision or inserts unsupported evidence | Transactional reservations, lease ownership, idempotency and independent-source evidence requirements | Medium |
| Repudiation | Insider disputes a policy publish, QA correction, schedule change or export | Actor and scope events, immutable policy versions and preserved review history | Medium until audit retention and access are signed off |
| Information disclosure | Other organization’s records, reporter evidence or request data leak | Server scopes, access checks on object reads and exports, no raw query logging, private responses | Medium |
| Denial of service | Saturated analytics, auth abuse or excessive polling | Request limits, route categories, bounded readiness and load gates | High pending representative benchmark and edge validation |
| Elevation | Unauthorized publication or QA reviewer changes verified state | Queue and policy scopes, independent evidence and supervised correction workflow | Medium |
| Credential compromise | Provider or database secrets leak through build or logs | Backend-only credential injection, stable URL construction and safe failure logs | High until rotation and least-privilege staging checks |

The model covers public users, moderators, QA auditors and supervisors, organization administrators, platform administrators, external clients, and insiders. Database providers and edge proxy controls remain outside the application trust boundary.
