# Phase 7 QA workflow

1. An administrator activates a sampling policy for an organization, LOB, or queue.
2. A moderator submits through the existing continuous workspace. The disposition and any supported verification become effective immediately.
3. The committed handling record enters asynchronous sampling. Selected reviews appear in Quality. Auditors can claim the next eligible item or receive a supervisor assignment.
4. Open the assigned review and start the assessment. Compare the immutable decision, cited evidence, historical policy, and original answers with current context. Releasing returns it to the worklist. An elapsed lease can be reclaimed and the old assignment version cannot submit.
5. Submit Pass when the original decision meets policy. Fail requires an error category, severity, policy reference and explanation. A proposed disposition is optional.
6. The original moderator can dispute a finalized failure. The disputed outcome is suspended from finalized accuracy. A supervisor independent of the original moderator and auditor can uphold, overturn, or request more review before resolution.
7. A finalized failure can produce a correction recommendation. The authorized supervisor uses a separate lease to review and commit a correction.

The worklist supports assigned, available, completed, disputed, and pending correction views with scope, outcome, status, error, date and severity filters. Dispute and correction actions appear only when relevant. The request-additional-review state records a supervisor action and leaves the dispute open for a subsequent decision. A dedicated second-auditor assignment within a dispute is outside this implementation.
