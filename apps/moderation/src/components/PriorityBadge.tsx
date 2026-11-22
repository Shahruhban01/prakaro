import React from 'react';

export const PriorityBadge: React.FC<{ priority: number }> = ({ priority }) => {
  let style = 'bg-slate-100 text-slate-700 border-slate-200';
  let label = 'P3 Low';

  if (priority >= 75) {
    style = 'bg-red-50 text-red-700 border-red-200';
    label = 'P0 Urgent';
  } else if (priority >= 50) {
    style = 'bg-orange-50 text-orange-700 border-orange-200';
    label = 'P1 High';
  } else if (priority >= 25) {
    style = 'bg-blue-50 text-blue-700 border-blue-200';
    label = 'P2 Medium';
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${style}`}>
      {label} ({priority})
    </span>
  );
};
