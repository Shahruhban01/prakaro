# Attendance security and Phase 4 contract

Only active workforce identities can punch their own AUX. The server resolves the Better Auth session ID and employee and validates active LOB and organization assignments. Bodies accept an AUX enum, attendance session ID and optimistic version. The backend rejects client timestamps and modifications for another employee.

Platform administrators have read-only platform reporting. Directors are scoped to one organization. Managers and supervisors can read employees on explicitly assigned teams. Operational staff can view their own history. Workforce POST requests use the existing origin protection and staff sign-out validates console origin before closing attendance.

The case guard checks existing `IN_REVIEW` records owned by the employee with a live lease. Phase 4 must use the same employee lock, validate queue scope, confirm `requireModeratingAux` and check reservation availability in one transaction. The Phase 2 legacy mutation restrictions remain in effect and no attendance API creates reservations.

