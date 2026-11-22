import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Copy, AlertCircle, ShieldAlert, Sparkles, Filter } from 'lucide-react';
import type { Queue, Rule, Config, Actor, Question } from '../api';
import { useData, useAction, errorText } from '../api';
import { RuleEditor } from '../components/RuleEditor';
import { FormBuilder } from '../components/FormBuilder';

const displayColumns = ['code', 'category', 'priority', 'status', 'owner', 'createdAt', 'trigger'];
const freshRule = (): Rule => ({ field: 'source', value: 'SEARCH' });

export const QueueSettings: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();

  const { data: queue, isLoading } = useData<Queue>(`/queues/${id}`, !isNew);
  const { data: session } = useData<Actor>('/session');
  const action = useAction();

  const isSuperAdmin = session?.superAdmin === true || session?.role === 'SUPER_ADMIN';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<Queue['kind']>('GENERAL');
  const [status, setStatus] = useState<Queue['status']>('ACTIVE');
  const [priority, setPriority] = useState(0);
  const [capacity, setCapacity] = useState(500);
  const [config, setConfig] = useState<Config>({
    rule: freshRule(),
    form: [],
    columns: ['code', 'category', 'status', 'priority'],
    slaHours: 48,
    qaPercent: 100,
  });

  useEffect(() => {
    if (queue) {
      setName(queue.name);
      setDescription(queue.description || '');
      setKind(queue.kind);
      setStatus(queue.status);
      setPriority(queue.priority);
      setCapacity(queue.capacity);
      if (queue.config) {
        setConfig(queue.config);
      }
    }
  }, [queue]);

  const handleSave = (duplicate: boolean = false) => {
    if (!isSuperAdmin) return;
    const url = isNew || duplicate ? '/queues' : `/queues/${id}`;
    const method = isNew || duplicate ? 'post' : 'put';
    const payload = {
      name: duplicate ? `${name} (Copy)` : name,
      description,
      kind,
      priority,
      capacity,
      config,
      ...(isNew || duplicate ? {} : { version: queue?.version ?? 1, status }),
    };

    action.mutate(
      { url, method, data: payload },
      {
        onSuccess: (data: any) => {
          navigate(data?.id ? `/queues/${data.id}` : '/queues');
        },
      },
    );
  };

  if (!isNew && isLoading) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading queue configuration...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/queues" className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {isNew ? 'Create Moderation Queue' : `Configure ${queue?.code || 'Queue'}`}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Super Admin routing rules, review form schemas, and operational capacity.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isNew && isSuperAdmin && (
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => handleSave(true)}
              disabled={action.isPending}
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicate Configuration
            </button>
          )}
          {isSuperAdmin ? (
            <button
              type="button"
              className="btn-primary text-xs"
              onClick={() => handleSave(false)}
              disabled={action.isPending}
            >
              <Save className="w-3.5 h-3.5" />
              {action.isPending ? 'Saving...' : 'Save Queue'}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded border border-amber-200">
              <ShieldAlert className="w-4 h-4" />
              <span>Read-Only (Super Admin Required)</span>
            </div>
          )}
        </div>
      </div>

      {!isSuperAdmin && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600" />
          <span>
            Only Super Administrators can create or update queue configurations and routing policies. Moderators and other staff can view queue cases only.
          </span>
        </div>
      )}

      {action.error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorText(action.error)}</span>
        </div>
      )}

      {/* Form sections */}
      <div className="space-y-6">
        {/* Basic Parameters */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
            1. Queue Parameters
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Queue Name</label>
              <input
                type="text"
                required
                disabled={!isSuperAdmin}
                className="w-full px-3 py-2 border border-slate-300 rounded bg-white disabled:bg-slate-50"
                placeholder="e.g. Restricted Access Review"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Queue Kind / Category</label>
              <select
                disabled={!isSuperAdmin}
                className="w-full px-3 py-2 border border-slate-300 rounded bg-white disabled:bg-slate-50"
                value={kind}
                onChange={(e) => setKind(e.target.value as Queue['kind'])}
              >
                <option value="GENERAL">GENERAL</option>
                <option value="AI">AI (AI Recommended)</option>
                <option value="ACCESS">ACCESS (Restricted Access)</option>
                <option value="REPORT">REPORT (User Reports)</option>
                <option value="REVERIFY">REVERIFY (Reverification)</option>
                <option value="ESCALATION">ESCALATION</option>
                <option value="QA">QA (Quality Assurance)</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Description</label>
              <input
                type="text"
                disabled={!isSuperAdmin}
                className="w-full px-3 py-2 border border-slate-300 rounded bg-white disabled:bg-slate-50"
                placeholder="Describe which tasks this queue handles..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Priority (0-100)</label>
              <input
                type="number"
                min="0"
                max="100"
                disabled={!isSuperAdmin}
                className="w-full px-3 py-2 border border-slate-300 rounded bg-white disabled:bg-slate-50"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Task Capacity</label>
              <input
                type="number"
                min="1"
                max="10000"
                disabled={!isSuperAdmin}
                className="w-full px-3 py-2 border border-slate-300 rounded bg-white disabled:bg-slate-50"
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">SLA Deadline (Hours)</label>
              <input
                type="number"
                min="1"
                max="8760"
                disabled={!isSuperAdmin}
                className="w-full px-3 py-2 border border-slate-300 rounded bg-white disabled:bg-slate-50"
                value={config.slaHours}
                onChange={(e) => setConfig({ ...config, slaHours: Number(e.target.value) })}
              />
            </div>

            {!isNew && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Status</label>
                <select
                  disabled={!isSuperAdmin}
                  className="w-full px-3 py-2 border border-slate-300 rounded bg-white disabled:bg-slate-50"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Queue['status'])}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="PAUSED">PAUSED</option>
                  <option value="ARCHIVED">ARCHIVED</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Visual Rule Builder & Super Admin Routing Presets */}
        <div className="card p-5 space-y-4">
          <div className="border-b border-slate-100 pb-2">
            <h2 className="text-sm font-bold text-slate-900">2. Super Admin Case Routing Policy</h2>
            <p className="text-[11px] text-slate-500">
              Decide which incoming cases route to this queue. Cases matching these rules will automatically land here for moderation.
            </p>
          </div>

          {/* Quick Routing Rule Presets */}
          {isSuperAdmin && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <span className="text-[11px] font-bold text-slate-700 block flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-blue-600" /> Quick Routing Presets (Click to Apply):
              </span>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, rule: { field: 'source', value: 'REPORT' } })}
                  className="px-2.5 py-1 bg-white hover:bg-blue-50 hover:text-blue-700 border border-slate-300 hover:border-blue-400 rounded transition-colors text-[11px] font-medium"
                >
                  🚨 User Problem Reports (source == REPORT)
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, rule: { field: 'source', value: 'SEARCH' } })}
                  className="px-2.5 py-1 bg-white hover:bg-blue-50 hover:text-blue-700 border border-slate-300 hover:border-blue-400 rounded transition-colors text-[11px] font-medium"
                >
                  🔍 New Discovered Facilities (source == SEARCH)
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, rule: { field: 'demand', value: '5' } })}
                  className="px-2.5 py-1 bg-white hover:bg-blue-50 hover:text-blue-700 border border-slate-300 hover:border-blue-400 rounded transition-colors text-[11px] font-medium"
                >
                  ⚡ High Demand Cases (demand &gt;= 5)
                </button>
                <button
                  type="button"
                  onClick={() => setConfig({ ...config, rule: { field: 'classification', value: 'UNCONFIRMED' } })}
                  className="px-2.5 py-1 bg-white hover:bg-blue-50 hover:text-blue-700 border border-slate-300 hover:border-blue-400 rounded transition-colors text-[11px] font-medium"
                >
                  ❓ Unconfirmed Candidates
                </button>
              </div>
            </div>
          )}

          <RuleEditor
            rule={config.rule}
            change={(newRule) => isSuperAdmin && setConfig({ ...config, rule: newRule })}
          />
        </div>

        {/* Display Columns */}
        <div className="card p-5 space-y-4">
          <div className="border-b border-slate-100 pb-2">
            <h2 className="text-sm font-bold text-slate-900">3. Queue Display Columns</h2>
            <p className="text-[11px] text-slate-500">
              Select which attributes moderators see in this queue's task table.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-xs">
            {displayColumns.map((col) => {
              const checked = config.columns.includes(col);
              return (
                <label key={col} className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    checked={checked}
                    onChange={(e) => {
                      if (!isSuperAdmin) return;
                      const next = e.target.checked
                        ? [...config.columns, col]
                        : config.columns.filter((c) => c !== col);
                      if (next.length > 0) {
                        setConfig({ ...config, columns: next });
                      }
                    }}
                  />
                  <span className="font-medium text-slate-700 capitalize">{col}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Review Form Questions Builder */}
        <div className="card p-5 space-y-4">
          <div className="border-b border-slate-100 pb-2">
            <h2 className="text-sm font-bold text-slate-900">4. Review Form Schema</h2>
            <p className="text-[11px] text-slate-500">
              Questions that moderators must answer before completing tasks in this queue.
            </p>
          </div>
          <FormBuilder
            questions={config.form}
            onChange={(newForm: Question[]) => isSuperAdmin && setConfig({ ...config, form: newForm })}
          />
        </div>
      </div>
    </div>
  );
};
