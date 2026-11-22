import React from 'react';
import { Link } from 'react-router-dom';
import { ListTodo, ArrowRight, Clock } from 'lucide-react';
import type { CaseRow } from '../api';
import { useData } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { PriorityBadge } from '../components/PriorityBadge';

export const MyTasks: React.FC = () => {
  const { data: casesData, isLoading } = useData<{ items: CaseRow[]; total: number }>(
    '/cases?mine=true',
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">My Claimed Tasks</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Active verification cases claimed by you with operational leases.
          </p>
        </div>
        <Link to="/cases" className="btn-secondary text-xs">
          Claim More Tasks
        </Link>
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
                <th className="py-3 px-4">Lease Expiry</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Loading your tasks...
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
                    <td className="py-3 px-4 font-mono text-amber-700">
                      {c.leaseUntil ? (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(c.leaseUntil).toLocaleTimeString()}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link to={`/cases/${c.id}`} className="btn-primary text-xs py-1 px-3">
                        Resume Review <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    You currently have no claimed tasks. Browse the Cases tab to claim a case.
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
