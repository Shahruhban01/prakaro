# LOB access and authorization

| Role | Read | Configure or grant |
| --- | --- | --- |
| Super Admin | Platform queues and legacy history | All organizations |
| Delegated Organization Director | Own organization | Own organization |
| Manager or supervisor | Active own-LOB grants with an active team assignment | No |
| Moderator, QA, viewer | Active own-LOB grants | No |
| Mobile user | Public parking endpoints only | No |

Grant replacement is version-checked and transactional. Grants identify the actor and timestamps. Removed grants retain a revocation timestamp and audit history. New grants require an active LOB within the queue's owning organization. Foreign LOBs fail at both the API and composite foreign keys. An organization or LOB deactivation suspends access without deleting history.

