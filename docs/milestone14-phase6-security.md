# Analytics security and attribution

Fastify uses the existing staff session resolver and workforce directory scope. The three Better Auth identity domains remain separate. A mobile user session cannot read workforce reports.

| Role | Scope |
| --- | --- |
| Super Admin | Platform and authorized requested filters |
| Organization administrator or director | Assigned organization |
| Manager or supervisor | Assigned team workforce and authorized LOB queue grants |
| Moderator or QA auditor | Personal performance and attendance |

Explicit unauthorized resource filters fail server-side. Report queries constrain attendance and completion scope before aggregation. An employee’s self report does not disclose anonymous shared pending work. Queue backlog counts in an authorized LOB are shared totals. Team rows compare current memberships. Historical organization and LOB follow the attendance snapshot.

Reports use operational counts and authorized workforce metadata. They do not select report notes, case evidence, media, raw prompts, provider metadata or session credentials. The frontend namespaces cache entries by actor identity, role and organization. Errors retain only the last response for the same request scope.
