import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { CaseRow } from '../api';
import { useData } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { PriorityBadge } from '../components/PriorityBadge';

export const Escalations: React.FC = () => {
  const { data: casesData, isLoading } = useData<{ items: CaseRow[]; total: number }>(
    '/cases?status=ESCALATED',
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Escalated Cases</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Complex verification tasks, reviewer disagreements, or high-risk claims escalated to supervisors.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Case Code</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Trigger</th>
                <th className="py-3 px-4">Escalated Date</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Loading escalations...
                  </td>
                </tr>
              ) : casesData?.items && casesData.items.length > 0 ? (
                casesData.items.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      <Link to={`/cases/${c.id}`} className="hover:text-blue-600 hover:underline">
                        {c.code}
                      </Link>
                    </td>
                    <td className="py-3 px-4 font-medium">{c.category.replace(/_/g, ' ')}</td>
                    <td className="py-3 px-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="py-3 px-4">
                      <PriorityBadge priority={c.priority} />
                    </td>
                    <td className="py-3 px-4 text-slate-500">{c.trigger}</td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link to={`/cases/${c.id}`} className="btn-primary text-xs py-1 px-3 bg-rose-600 hover:bg-rose-700">
                        Arbitrate Case <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No active escalations. The moderation queues are healthy.
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
