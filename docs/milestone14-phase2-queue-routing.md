# Queue routing

New owned queues default to intake disabled. Administrators explicitly enable intake and configure bounded AND/OR rules. Rules can use `source`, `category`, `reportCategory`, evidence and classification facts already supplied by Prakaro. Source values remain SEARCH and REPORT. Report category is separate from the canonical case category.

One eligible queue receives new work. Active opted-in owned queues are preferred, in descending priority and stable ID order among the candidate queues. Existing unowned queues are a platform-only compatibility fallback until operators map them. Capacity, provider ID safeguards, daily limits and the canonical active key still apply. Existing cases retain their task, configuration version and form even if the routing policy changes. Routing decisions are recorded in the moderation audit log.

A repeated report associates with the active report case for that facility. Reports with no eligible queue are retained in the restricted audit record with routed=false. Automatic replay of unmatched reports is outside this phase. Public reports do not create verified attributes. Search intake still requires the existing authenticated, user-initiated event and only acts on returned candidates.

