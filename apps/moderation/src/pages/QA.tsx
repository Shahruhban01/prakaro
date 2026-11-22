import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, CheckCircle2, RotateCcw, AlertTriangle, ArrowRight } from 'lucide-react';
import type { CaseRow } from '../api';
import { useData, useAction, errorText } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { PriorityBadge } from '../components/PriorityBadge';

export const QA: React.FC = () => {
  const { data: casesData, isLoading, refetch } = useData<{ items: CaseRow[]; total: number }>(
    '/cases?status=PENDING_QA',
  );
  const action = useAction();

  const [activeCase, setActiveCase] = useState<CaseRow | null>(null);
  const [qaReason, setQaReason] = useState('');
  const [qaAction, setQaAction] = useState<'PUBLISH' | 'REOPEN'>('PUBLISH');

  const handleDecision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCase) return;

    action.mutate(
      {
        url: `/cases/${activeCase.id}/qa`,
        method: 'post',
        data: {
          action: qaAction,
          revision: activeCase.revision,
          reason: qaReason,
        },
      },
      {
        onSuccess: () => {
          setActiveCase(null);
          setQaReason('');
          refetch();
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Quality Assurance Auditing</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Independent second-reviewer gate before publishing evidence-backed parking verification decisions.
        </p>
      </div>

      {action.error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorText(action.error)}</span>
        </div>
      )}

      {/* Decision Modal / Dialog */}
      {activeCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="card w-full max-w-lg p-6 space-y-4 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="text-sm font-bold text-slate-900">
                QA Audit Decision: {activeCase.code}
              </h2>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                onClick={() => setActiveCase(null)}
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              As an independent QA Reviewer or Supervisor, verify that the evidence on file strictly
              supports the reviewer's conclusions before publishing.
            </p>

            <form onSubmit={handleDecision} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">QA Determination</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 ${
                      qaAction === 'PUBLISH'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                    onClick={() => setQaAction('PUBLISH')}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> PUBLISH DECISION
                  </button>
                  <button
                    type="button"
                    className={`p-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 ${
                      qaAction === 'REOPEN'
                        ? 'bg-orange-50 border-orange-400 text-orange-800'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                    onClick={() => setQaAction('REOPEN')}
                  >
                    <RotateCcw className="w-4 h-4 text-orange-600" /> REOPEN CASE
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Audit Notes / Justification <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                  placeholder="Record verification of physical evidence, operator statement, or grounds for reopening..."
                  value={qaReason}
                  onChange={(e) => setQaReason(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  onClick={() => setActiveCase(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={action.isPending}
                  className="btn-primary text-xs"
                >
                  {action.isPending ? 'Confirming...' : 'Confirm QA Decision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cases Awaiting QA Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Case Code</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Review Status</th>
                <th className="py-3 px-4">Submitted Date</th>
                <th className="py-3 px-4 text-right">Audit Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Loading QA pipeline...
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
                      <PriorityBadge priority={c.priority} />
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/cases/${c.id}`} className="btn-secondary text-[11px] py-1 px-2.5">
                          Inspect Workbench
                        </Link>
                        <button
                          type="button"
                          className="btn-primary text-[11px] py-1 px-3 bg-cyan-600 hover:bg-cyan-700"
                          onClick={() => setActiveCase(c)}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" /> Decide QA
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No cases currently pending QA. All completed reviews have been audited.
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
