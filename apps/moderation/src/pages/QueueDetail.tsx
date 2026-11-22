import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Settings, Layers, ListFilter } from 'lucide-react';
import type { Queue, CaseRow } from '../api';
import { useData } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { PriorityBadge } from '../components/PriorityBadge';

export const QueueDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: queue, isLoading: queueLoading } = useData<Queue>(`/queues/${id}`);
  const { data: casesData, isLoading: casesLoading } = useData<{ items: CaseRow[]; total: number }>(
    `/cases?queue=${id}`,
    Boolean(id),
  );

  if (queueLoading) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading queue details...</div>;
  }

  if (!queue) {
    return (
      <div className="p-8 text-center text-xs text-red-500">
        Queue not found or you do not have permission to view it.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/queues" className="text-slate-400 hover:text-slate-600">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
              {queue.code}
            </span>
            <StatusBadge status={queue.kind} />
            <StatusBadge status={queue.status} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{queue.name}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{queue.description || 'No description provided.'}</p>
        </div>

        <Link to={`/queues/${queue.id}/settings`} className="btn-secondary text-xs">
          <Settings className="w-4 h-4" />
          Edit Queue Settings
        </Link>
      </div>

      {/* Queue Configurations Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <span className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">Parameters</span>
          <div className="mt-2 space-y-1.5 text-xs text-slate-700">
            <div className="flex justify-between">
              <span className="text-slate-500">Priority:</span>
              <PriorityBadge priority={queue.priority} />
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Capacity:</span>
              <span className="font-mono font-semibold">{queue.capacity} tasks</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">SLA:</span>
              <span className="font-mono font-semibold">{queue.config?.slaHours ?? 48} hours</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">QA Sampling:</span>
              <span className="font-mono font-semibold">{queue.config?.qaPercent ?? 100}%</span>
            </div>
          </div>
        </div>

        <div className="card p-4 md:col-span-2">
          <span className="text-[11px] font-semibold uppercase text-slate-400 tracking-wider">
            Review Form & Questions ({queue.config?.form?.length ?? 0})
          </span>
          <div className="mt-2 space-y-1 overflow-y-auto max-h-32 text-xs">
            {queue.config?.form && queue.config.form.length > 0 ? (
              queue.config.form.map((q, idx) => (
                <div key={q.key} className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
                  <span className="text-slate-800 font-medium">
                    #{idx + 1}. {q.label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                      {q.type}
                    </span>
                    {q.required && (
                      <span className="text-[10px] bg-red-50 text-red-600 px-1 py-0.5 rounded font-semibold">
                        Req
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-400 italic">No custom questions configured (default review format).</p>
            )}
          </div>
        </div>
      </div>

      {/* Queue Tasks / Cases Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Cases in Queue ({casesData?.total ?? 0})</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Case Code</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Priority</th>
                <th className="py-2.5 px-4">Assigned Moderator</th>
                <th className="py-2.5 px-4">Trigger</th>
                <th className="py-2.5 px-4">Created</th>
                <th className="py-2.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {casesLoading ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400">
                    Loading cases...
                  </td>
                </tr>
              ) : casesData?.items && casesData.items.length > 0 ? (
                casesData.items.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                      <Link to={`/cases/${c.id}`} className="hover:text-blue-600 hover:underline">
                        {c.code}
                      </Link>
                    </td>
                    <td className="py-2.5 px-4 font-medium">{c.category.replace(/_/g, ' ')}</td>
                    <td className="py-2.5 px-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="py-2.5 px-4">
                      <PriorityBadge priority={c.priority} />
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">
                      {c.owner ? c.owner.slice(0, 10) + '...' : <span className="italic text-slate-400">Unassigned</span>}
                    </td>
                    <td className="py-2.5 px-4 text-slate-500">{c.trigger}</td>
                    <td className="py-2.5 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <Link to={`/cases/${c.id}`} className="btn-secondary text-[11px] py-1 px-2.5">
                        Workbench
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400">
                    No active cases currently in this queue.
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
