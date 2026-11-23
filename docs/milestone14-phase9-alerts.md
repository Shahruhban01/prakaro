# Phase 9 operational alerts

Organization and platform administrators configure backlog, stale attendance, QA backlog and staffing shortfall rules. A rule records a scope, value threshold, severity, enabled flag, evaluation interval and cooldown. Queue backlog and QA backlog can target a specific queue. Staffing shortfall checks scheduled employees without a recently observed active attendance session.

Fastify starts a bounded periodic worker. A transaction locks the rule before measurement. A unique active key limits each rule to one unresolved event across workers. Repeated violations update the observed value. A return below the threshold resolves it. The cooldown starts after resolution. Rule edits use revision checks and end superseded alert events.

Acknowledgment records the authenticated administrator and timestamp and leaves the condition open. Rule creation, update, trigger, acknowledgment and resolution use the audit log. The worker updates operational records only and does not change employee attendance, AUX, performance or case assignments.
