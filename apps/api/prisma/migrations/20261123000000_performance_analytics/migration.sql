CREATE INDEX `attendance_report_org_start` ON `attendance_session` (`organizationId`, `startedAt`);
CREATE INDEX `attendance_report_lob_start` ON `attendance_session` (`lobId`, `startedAt`);
CREATE INDEX `reservation_report_queue_lease` ON `moderation_case_reservation` (`queueId`, `status`, `leaseExpiresAt`);
CREATE INDEX `reservation_report_queue_release` ON `moderation_case_reservation` (`queueId`, `status`, `releasedAt`);
CREATE INDEX `handling_report_submitted` ON `case_handling_record` (`submittedAt`);
