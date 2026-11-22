import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, ArrowRight, UserCheck } from 'lucide-react';
import type { CaseRow, Queue } from '../api';
import { useData } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { PriorityBadge } from '../components/PriorityBadge';

export const Cases: React.FC = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [queueId, setQueueId] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [mineOnly, setMineOnly] = useState(false);

  const { data: queues } = useData<Queue[]>('/queues');

  const queryParams = new URLSearchParams({
    page: String(page),
    ...(search ? { search } : {}),
    ...(queueId ? { queue: queueId } : {}),
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
    ...(mineOnly ? { mine: 'true' } : {}),
  });

  const { data: casesData, isLoading } = useData<{ items: CaseRow[]; total: number }>(
    `/cases?${queryParams.toString()}`,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Verification Cases</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Search-driven candidate cases, reviewer assignments, and verification lifecycle.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`btn-secondary text-xs ${mineOnly ? 'bg-blue-50 border-blue-300 text-blue-700' : ''}`}
            onClick={() => setMineOnly(!mineOnly)}
          >
            <UserCheck className="w-3.5 h-3.5" />
            {mineOnly ? 'Showing My Claims' : 'Filter My Claims'}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card p-3.5 flex flex-wrap items-center gap-3 text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            className="w-full rounded-md border border-slate-300 py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            placeholder="Search by case code (e.g. CASE-2026-...) or Place ID"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            className="px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-xs"
            value={queueId}
            onChange={(e) => {
              setQueueId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Queues</option>
            {queues?.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name} ({q.code})
              </option>
            ))}
          </select>

          <select
            className="px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-xs"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="QUEUED">QUEUED</option>
            <option value="IN_REVIEW">IN_REVIEW</option>
            <option value="AWAITING_EVIDENCE">AWAITING_EVIDENCE</option>
            <option value="PENDING_QA">PENDING_QA</option>
            <option value="ESCALATED">ESCALATED</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="REOPENED">REOPENED</option>
          </select>

          <select
            className="px-2.5 py-1.5 rounded-md border border-slate-300 bg-white text-xs"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Categories</option>
            <option value="NEW_FACILITY_VERIFICATION">New Facility</option>
            <option value="USER_REPORT_REVIEW">User Report</option>
            <option value="AI_UNCERTAIN_REVIEW">AI Uncertain</option>
            <option value="RESTRICTED_ACCESS_REVIEW">Restricted Access</option>
            <option value="REVERIFICATION">Reverification</option>
          </select>
        </div>
      </div>

      {/* Cases Table */}
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
                <th className="py-3 px-4">Owner</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Loading cases...
                  </td>
                </tr>
              ) : casesData?.items && casesData.items.length > 0 ? (
                casesData.items.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
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
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {c.owner ? (
                        <span className="text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-mono text-[11px]">
                          {c.owner.slice(0, 10)}...
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        to={`/cases/${c.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                      >
                        Workbench <ArrowRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No matching verification cases found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {casesData && casesData.total > 50 && (
          <div className="p-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {(page - 1) * 50 + 1} - {Math.min(page * 50, casesData.total)} of {casesData.total}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                className="btn-secondary text-xs py-1 px-2.5"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn-secondary text-xs py-1 px-2.5"
                disabled={page * 50 >= casesData.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
