import React from 'react';
import { ShieldCheck, Lock, Check, X } from 'lucide-react';

const ROLES = [
  {
    role: 'SUPER_ADMIN',
    description: 'Full platform administrative control. Can bootstrap admins, manage queues, configure AI, and audit.',
    permissions: ['All Permissions', 'Bootstrap Admins', 'All Queues Access', 'System Settings'],
  },
  {
    role: 'ADMIN',
    description: 'Organization director. Manages the assigned organization and configures its queues when delegated.',
    permissions: ['Create/Edit Queues', 'Assign Moderators', 'View Audit Log', 'Configure AI'],
  },
  {
    role: 'MODERATION_MANAGER',
    description: 'Operational manager overseeing throughput, backlog health, and team dispatch.',
    permissions: ['Dispatch Tasks', 'Monitor SLA', 'Manage Queue Capacities', 'Inspect Reviews'],
  },
  {
    role: 'SUPERVISOR',
    description: 'Senior reviewer resolving escalations, complex contradictory evidence, and overrides.',
    permissions: ['Arbitrate Escalations', 'Override Claims', 'Approve Edge Cases', 'Audit Decisions'],
  },
  {
    role: 'QA_REVIEWER',
    description: 'Independent auditor performing second-review checks before publishing verified attributes.',
    permissions: ['Audit Completed Reviews', 'Publish Verification', 'Reopen Defective Cases'],
  },
  {
    role: 'MODERATOR',
    description: 'Subscribes to queues authorized for their LOB and inspects cases in read-only View mode.',
    permissions: ['Claim Tasks in Assigned Queues', 'Record Evidence', 'Submit Structured Decisions'],
  },
  {
    role: 'VIEWER',
    description: 'Read-only observer access for compliance audits and reporting.',
    permissions: ['Read-only Case View', 'Read-only Queue View'],
  },
];

export const Permissions: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Role-Based Access Control (RBAC)</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Prakaro Trust & Safety permission tiers and queue-level boundary isolation policies.
        </p>
      </div>

      <div className="card p-4 bg-blue-50/50 border-blue-200 text-xs text-blue-900 flex items-start gap-3">
        <Lock className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <span className="font-bold block">Strict Server-Side Enforcement</span>
          All permission checks and queue boundaries are enforced authoritatively by Fastify middleware
          and MySQL constraints. Client-side navigation guards merely provide responsive UX.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ROLES.map((r) => (
          <div key={r.role} className="card p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                {r.role}
              </span>
              <ShieldCheck className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-xs text-slate-600">{r.description}</p>
            <div className="pt-2 border-t border-slate-100 space-y-1">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block tracking-wider">
                Granted Capabilities
              </span>
              <div className="flex flex-wrap gap-1">
                {r.permissions.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1 text-[11px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded"
                  >
                    <Check className="w-3 h-3 text-emerald-600" /> {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
