# Queue subscriptions

Moderators subscribe as themselves to an active authorized queue using POST `/queues/:id/subscribe`. DELETE ends the preference and retains an audit event. Rejoining reactivates the existing preference row. Concurrent calls cannot create duplicate preferences. Requests with another moderator ID are rejected. Existing subscription rows grant no permission and disappear from the active worklist when their LOB grant is revoked.

`/available-queues` lists active authorized queues. `/my-queues` shows active authorized subscriptions. The Moderate button opens the prerequisites screen. The corresponding server operation also denies entry until persisted AUX and reservations exist. View mode reads queue-contained cases and has no submission controls.

