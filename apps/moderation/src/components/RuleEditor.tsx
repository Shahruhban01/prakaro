import React from 'react';
import { Plus, Trash2, Layers } from 'lucide-react';
import type { Rule } from '../api';

const fields = [
  'category','reportCategory',
  'source',
  'status',
  'classification',
  'access',
  'pricing',
  'evidence',
  'ai',
  'demand',
  'priority',
  'region',
];

const fresh = (): Rule => ({ field: 'source', value: 'SEARCH' });

export function RuleEditor({
  rule,
  change,
  depth = 0,
}: {
  rule: Rule;
  change: (r: Rule) => void;
  depth?: number;
}) {
  if ('field' in rule) {
    return (
      <div className="flex flex-wrap items-center gap-2 p-2 rounded bg-slate-50 border border-slate-200">
        <select
          aria-label="Condition field"
          className="px-2.5 py-1.5 text-xs font-medium rounded border border-slate-300 bg-white"
          value={rule.field}
          onChange={(e) => change({ ...rule, field: e.target.value })}
        >
          {fields.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500 font-mono">
          {['demand', 'priority'].includes(rule.field) ? '>=' : '=='}
        </span>
        <input
          aria-label="Condition value"
          className="px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white flex-1 min-w-[120px]"
          value={rule.value}
          placeholder="e.g. SEARCH, 1"
          onChange={(e) => change({ ...rule, value: e.target.value })}
        />
        {depth < 3 && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-white border border-slate-300 rounded text-slate-600 hover:bg-slate-100"
            onClick={() => change({ op: 'AND', children: [rule, fresh()] })}
            title="Convert to nested group"
          >
            <Layers className="w-3 h-3 text-slate-500" />
            Group
          </button>
        )}
      </div>
    );
  }

  return (
    <fieldset className="border border-indigo-200 rounded-lg p-3 bg-indigo-50/20 space-y-2">
      <legend className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
        Group
      </legend>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-slate-600">Match</span>
        <select
          aria-label="Group operator"
          className="px-2 py-1 text-xs font-bold rounded border border-indigo-300 bg-white text-indigo-700"
          value={rule.op}
          onChange={(e) => change({ ...rule, op: e.target.value as 'AND' | 'OR' })}
        >
          <option value="AND">ALL (AND)</option>
          <option value="OR">ANY (OR)</option>
        </select>
        <span className="text-xs text-slate-500">conditions below:</span>
      </div>

      <div className="space-y-2 pl-2 border-l-2 border-indigo-200">
        {rule.children.map((r, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1">
              <RuleEditor
                depth={depth + 1}
                rule={r}
                change={(v) =>
                  change({
                    ...rule,
                    children: rule.children.map((x, j) => (j === i ? v : x)),
                  })
                }
              />
            </div>
            {rule.children.length > 1 && (
              <button
                type="button"
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                onClick={() =>
                  change(
                    rule.children.length === 2
                      ? rule.children[1 - i]!
                      : { ...rule, children: rule.children.filter((_, j) => j !== i) },
                  )
                }
                title="Remove condition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {rule.children.length < 5 && (
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50 rounded"
          onClick={() => change({ ...rule, children: [...rule.children, fresh()] })}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Condition
        </button>
      )}
    </fieldset>
  );
}
