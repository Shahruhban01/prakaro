# Phase 7 sampling

Administrators can activate an organization default or override it for a LOB or queue. Precedence is queue, LOB, then organization. An explicit disabled override shadows wider scopes. Rates are stored as integer basis points from 0 through 10,000. A policy edit closes the existing interval and creates a version. The decision completion timestamp selects the version even if sampling is delayed.

For an eligible decision, the server draws an integer uniformly from 0 through 9,999 using Node's cryptographic random generator. A draw below the rate selects the decision. The worker scans older completions first to recover from downtime, while the draw ignores order, identity, location and content. A unique decision reference and transaction persist the draw and result once.

Eligibility requires a committed, attributed decision with canonical valid handling and matching queue and organization. Expired, abandoned, invalid, view-only, and correction handling do not qualify. The automatic worker begins at the earliest configured effective date and caps each poll at 40 inputs in groups of four. An administrator can explicitly select an older eligible decision by ID. Manual selection is audited and reported separately from random sampling coverage.
