# Workforce reporting

Attendance and interval timestamps are stored in UTC. The current reporting timezone is UTC because the organization model has no reporting-timezone setting. Date filters include both selected calendar dates. Reports cap the requested window at 31 days and paginate attendance sessions by 25.

Duration is the intersection of each authoritative interval and the requested reporting window. Overnight sessions therefore contribute to each day according to elapsed time. Fractional seconds survive API aggregation. Sign-in counts use distinct Better Auth session IDs observed for attendance in the window. Sign-out times represent explicit sign-out. System expiry, disconnect and deactivation report the actual reconciliation reason separately.

The live view distinguishes current AUX, presence, active attendance and a genuine active legacy case. It polls every 15 seconds in foreground tabs. The global header reads AUX every 10 seconds, refreshes on focus, and derives the timer from server time and the interval start. The UI clears attendance access on authentication expiry and avoids optimistic AUX changes.

