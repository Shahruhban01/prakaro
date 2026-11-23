# Phase 9 scheduling

Create active or inactive shift definitions with local start and end, IANA timezone, unpaid planned break and arrival/departure grace settings. An end earlier than the start belongs to the following day. Equal start and end is invalid. Definitions have optimistic revisions, and edits do not alter assigned occurrences.

Assignments support one date, selected weekdays, or selected weekdays on alternate weeks anchored to the first requested date. A recurrence is materialized to at most 93 local days. Each row freezes its organization, LOB, designated team, shift name, timezone, rule values and effective UTC timestamps. For staff with multiple team memberships, select a designated team. Only active employees with permitted team and tenant scope may receive assignments.

A transaction locks the existing employee row before checking schedule overlap. Adjacent half-open shifts are allowed. Future shifts can be cancelled or replaced with a shift, week off, or excused absence. A replacement records both occurrences and an audit event. Past work stays in history.

IANA wall-time resolution handles DST using actual offsets. Nonexistent clock times during a forward transition return a validation error. Repeated fall-back times use their first occurrence. The day, week and month calendars render the same stored occurrences in the reporting timezone.
