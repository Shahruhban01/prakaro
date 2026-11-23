# Average handling time in seconds

Eligible case handling records must match their reservation, case, queue, reviewer, session and accepted decision. The reservation must be completed. Start time must equal the reservation start, submission must fall between start and lease expiry, and duration must be nonnegative. View-only, abandoned, expired, incomplete and invalid records do not contribute. Unique reservation and decision keys prevent duplicate retries from increasing AHT.

For 10 cases with 800 total handling seconds and two cases with 400 total handling seconds, the result is 1200 ÷ 12 = 100s. An empty cohort returns null and displays Unavailable. Queue metrics, session reporting and the new console use the same definition. Attribution follows the submitted timestamp. AUX is used separately for cases per moderating hour and utilization.
