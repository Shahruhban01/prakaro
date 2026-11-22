import React, { useState } from 'react';
import { History, Eye, ChevronDown, ChevronRight } from 'lucide-react';
import type { AuditLogEntry } from '../api';
import { useData } from '../api';

export const AuditLog: React.FC = () => {
  const { data: audits, isLoading } = useData<AuditLogEntry[]>('/audit-log');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">System Audit Trail</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Immutable operational log recording all administrative, routing, claiming, and verification decisions.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4 w-8" />
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Target Resource</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Loading audit trail...
                  </td>
                </tr>
              ) : audits && audits.length > 0 ? (
                audits.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  return (
                    <React.Fragment key={entry.id}>
                      <tr
                        className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                        onClick={() => toggleExpand(entry.id)}
                      >
                        <td className="py-3 px-4 text-slate-400">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                            {entry.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-900">{entry.target}</td>
                        <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                          {entry.actor.slice(0, 12)}...
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                          {new Date(entry.createdAt).toLocaleString()}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={5} className="p-4 border-t border-slate-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                              <div>
                                <span className="font-bold text-slate-700 block mb-1">State Before:</span>
                                <pre className="p-2.5 bg-white border border-slate-200 rounded font-mono text-[11px] overflow-x-auto max-h-48 text-slate-800">
                                  {JSON.stringify(entry.before || {}, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <span className="font-bold text-slate-700 block mb-1">State After / Payload:</span>
                                <pre className="p-2.5 bg-white border border-slate-200 rounded font-mono text-[11px] overflow-x-auto max-h-48 text-slate-800">
                                  {JSON.stringify(entry.after || {}, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No audit records logged yet.
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
