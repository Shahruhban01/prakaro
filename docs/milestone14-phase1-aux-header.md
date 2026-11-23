# Global AUX control

The shared header mounts `GlobalAuxControl` immediately before notifications and account controls. It stays in the top-right action group at narrow widths. The keyboard-accessible disclosure lists Moderating, Non-moderating, Break, Meeting, Offline and Training.

The application supplies the unavailable state because the repository has no attendance API. Punching is disabled and there is no fabricated timer or history. The shared type supports current status, elapsed seconds, pending transitions, errors and an active-case lock reason. Phase 3 will supply server state and enforce transition locks on the backend.

AUX displays elapsed time as HH:MM:SS. The shared AHT formatter presents handling time in seconds.

