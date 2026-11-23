# Phase 8 tags

A tag has a stable identifier, label, category, severity, plain-text descriptions and examples. The array order controls display order. Tags can apply to selected decisions, depend on a visible form answer, be required, and exclude named tag IDs. A policy publication validates references and rejects known conflicts between simultaneously required tags.

The workspace shows searchable tags grouped by category. Labels are presentation only. Submission sends the stable IDs and the pinned policy version. Server validation rejects duplicates, absent required IDs, incompatible combinations and tags unavailable for the decision. The effective policy, answers and selected IDs are retained for historical QA. Queue forms with legacy reason-choice tags use their original behavior.
