import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Question } from '../api';

const questionTypes: Question['type'][] = [
  'SELECT',
  'MULTI',
  'BOOLEAN',
  'TEXT',
  'NUMBER',
  'DATE',
  'EVIDENCE',
  'REASON',
  'NOTES',
];

export function FormBuilder({
  questions,
  onChange,
}: {
  questions: Question[];
  onChange: (q: Question[]) => void;
}) {
  const updateQuestion = (index: number, patch: Partial<Question>) => {
    onChange(questions.map((q, j) => (j === index ? { ...q, ...patch } : q)));
  };

  const removeQuestion = (index: number) => {
    onChange(questions.filter((_, j) => j !== index));
  };

  const addQuestion = () => {
    const key = 'q_' + Math.random().toString(36).slice(2, 8);
    onChange([
      ...questions,
      {
        key,
        label: '',
        type: 'BOOLEAN',
        required: true,
        options: [],
      },
    ]);
  };

  return (
    <div className="space-y-3">
      {questions.map((q, idx) => (
        <div key={q.key || idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                  #{idx + 1}
                </span>
                <input
                  type="text"
                  required
                  placeholder="Question Prompt / Label (e.g. Does a real parking facility exist?)"
                  className="w-full text-xs font-medium px-2.5 py-1.5 border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={q.label}
                  onChange={(e) => updateQuestion(idx, { label: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Answer Type</label>
                  <select
                    className="w-full px-2 py-1 border border-slate-300 rounded bg-white"
                    value={q.type}
                    onChange={(e) => updateQuestion(idx, { type: e.target.value as Question['type'] })}
                  >
                    {questionTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Field Key</label>
                  <input
                    type="text"
                    required
                    className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-mono text-slate-600"
                    value={q.key}
                    onChange={(e) => updateQuestion(idx, { key: e.target.value })}
                  />
                </div>

                <div className="flex items-center pt-5">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      checked={q.required}
                      onChange={(e) => updateQuestion(idx, { required: e.target.checked })}
                    />
                    <span className="text-xs font-medium text-slate-700">Required</span>
                  </label>
                </div>
              </div>

              {['SELECT', 'MULTI'].includes(q.type) && (
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Choices (comma-delimited)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Yes, No, Unknown"
                    className="w-full text-xs px-2.5 py-1 border border-slate-300 rounded bg-white"
                    value={q.options.join(', ')}
                    onChange={(e) =>
                      updateQuestion(idx, {
                        options: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
              onClick={() => removeQuestion(idx)}
              title="Remove question"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md hover:bg-blue-100"
        onClick={addQuestion}
      >
        <Plus className="w-4 h-4" />
        Add Review Question
      </button>
    </div>
  );
}
