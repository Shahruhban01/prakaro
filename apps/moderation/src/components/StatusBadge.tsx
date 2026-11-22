import React from 'react';

const statusStyles: Record<string, string> = {
  NEW: 'bg-blue-50 text-blue-700 border-blue-200',
  QUEUED: 'bg-slate-100 text-slate-700 border-slate-200',
  ASSIGNED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  IN_REVIEW: 'bg-amber-50 text-amber-700 border-amber-200',
  AWAITING_EVIDENCE: 'bg-purple-50 text-purple-700 border-purple-200',
  ESCALATED: 'bg-rose-50 text-rose-700 border-rose-200',
  PENDING_QA: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  CLOSED: 'bg-gray-100 text-gray-600 border-gray-200',
  REOPENED: 'bg-orange-50 text-orange-700 border-orange-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PAUSED: 'bg-amber-50 text-amber-700 border-amber-200',
  ARCHIVED: 'bg-gray-100 text-gray-500 border-gray-200',
  GENERAL: 'bg-blue-50 text-blue-700 border-blue-200',
  AI: 'bg-violet-50 text-violet-700 border-violet-200',
  ACCESS: 'bg-orange-50 text-orange-700 border-orange-200',
  REPORT: 'bg-rose-50 text-rose-700 border-rose-200',
  REVERIFY: 'bg-teal-50 text-teal-700 border-teal-200',
  QA: 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

export const StatusBadge: React.FC<{ status: string; label?: string }> = ({ status, label }) => {
  const style = statusStyles[status] || 'bg-gray-100 text-gray-700 border-gray-200';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${style}`}
    >
      {label || status.replace(/_/g, ' ')}
    </span>
  );
};
