import React from 'react';
import { Link } from 'react-router-dom';
import { Plus, Settings, Eye, Layers, ShieldAlert } from 'lucide-react';
import type { Queue, Actor } from '../api';
import { useData } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { PriorityBadge } from '../components/PriorityBadge';

export const Queues: React.FC = () => {
  const { data: queues, isLoading } = useData<Queue[]>('/queues');
  const { data: session } = useData<Actor>('/session');

  const isSuperAdmin = session?.superAdmin === true || session?.role === 'SUPER_ADMIN';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Moderation Queues</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage task queues, routing policies, display schemas, and review form questions.
          </p>
        </div>
        {isSuperAdmin ? (
          <Link to="/queues/new" className="btn-primary text-xs">
            <Plus className="w-4 h-4" />
            Create Custom Queue
          </Link>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            <ShieldAlert className="w-4 h-4 text-slate-400" />
            <span>Queue creation is restricted to Super Admin</span>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Queue Code</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Kind</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Capacity</th>
                <th className="py-3 px-4">SLA</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Loading queues...
                  </td>
                </tr>
              ) : queues && queues.length > 0 ? (
                queues.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      <Link to={`/queues/${q.id}`} className="hover:text-blue-600 hover:underline">
                        {q.code}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{q.name}</div>
                      {q.description && (
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">
                          {q.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={q.kind} />
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={q.status} />
                    </td>
                    <td className="py-3 px-4">
                      <PriorityBadge priority={q.priority} />
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">{q.capacity} max</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{q.config?.slaHours ?? 48}h</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/queues/${q.id}`}
                          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded"
                          title="View queue cases"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        {isSuperAdmin && (
                          <Link
                            to={`/queues/${q.id}/settings`}
                            className="p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded"
                            title="Queue settings & rule builder"
                          >
                            <Settings className="w-4 h-4" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No moderation queues found. Create your first queue to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
