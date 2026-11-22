import React from 'react';
import { Link } from 'react-router-dom';
import {
  FileCheck2,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Layers,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Activity,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { Analytics, Queue, AuditLogEntry } from '../api';
import { useData } from '../api';
import { StatusBadge } from '../components/StatusBadge';

const STATUS_COLORS: Record<string, string> = {
  QUEUED: '#94a3b8',
  IN_REVIEW: '#f59e0b',
  PENDING_QA: '#06b6d4',
  APPROVED: '#10b981',
  REJECTED: '#ef4444',
  ESCALATED: '#f43f5e',
  AWAITING_EVIDENCE: '#a855f7',
};

export const Dashboard: React.FC = () => {
  const { data: analytics, isLoading: analyticsLoading } = useData<Analytics>('/analytics');
  const { data: queues, isLoading: queuesLoading } = useData<Queue[]>('/queues');
  const { data: audits, isLoading: auditsLoading } = useData<AuditLogEntry[]>('/audit-log');

  const statusMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    analytics?.byStatus?.forEach((s) => {
      map[s.status] = s.count;
    });
    return map;
  }, [analytics]);

  const chartData = React.useMemo(() => {
    return (
      analytics?.byStatus?.map((s) => ({
        name: s.status.replace(/_/g, ' '),
        rawStatus: s.status,
        count: s.count,
      })) || []
    );
  }, [analytics]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Operations Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time parking verification cases, queue load, and human moderation activity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/cases" className="btn-secondary text-xs">
            Browse All Cases
          </Link>
          <Link to="/queues/new" className="btn-primary text-xs">
            Create Queue
          </Link>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="card p-3.5">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Cases</span>
            <FileCheck2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {analyticsLoading ? '...' : analytics?.totalCases ?? 0}
          </div>
          <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
            <Activity className="w-3 h-3 text-emerald-500" /> Search-discovered
          </span>
        </div>

        <div className="card p-3.5">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Queued</span>
            <Clock className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {analyticsLoading ? '...' : statusMap['QUEUED'] ?? 0}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Awaiting claim</span>
        </div>

        <div className="card p-3.5">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">In Review</span>
            <TrendingUp className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600">
            {analyticsLoading ? '...' : statusMap['IN_REVIEW'] ?? 0}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Active reviewer leases</span>
        </div>

        <div className="card p-3.5">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">QA Pending</span>
            <ShieldCheck className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-2xl font-bold text-cyan-600">
            {analyticsLoading ? '...' : statusMap['PENDING_QA'] ?? 0}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">2nd review gate</span>
        </div>

        <div className="card p-3.5">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Escalated</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600">
            {analyticsLoading ? '...' : statusMap['ESCALATED'] ?? 0}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Requires supervisor</span>
        </div>

        <div className="card p-3.5 bg-emerald-50/40 border-emerald-200">
          <div className="flex items-center justify-between text-emerald-700 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Verified</span>
            <Sparkles className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700">
            {analyticsLoading ? '...' : analytics?.verifiedCount ?? 0}
          </div>
          <span className="text-[10px] text-emerald-600 mt-1 block">Evidence-backed published</span>
        </div>
      </div>

      {/* Charts & Queue Load Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Case Status Distribution Chart */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Case Status Distribution</h2>
              <p className="text-[11px] text-slate-500">Breakdown of all active and completed moderation tasks</p>
            </div>
            <Link to="/analytics" className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
              Full Analytics <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="h-64 w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-25} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.rawStatus] || '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No case distribution data available yet.
              </div>
            )}
          </div>
        </div>

        {/* Queues Overview */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Moderation Queues</h2>
              <p className="text-[11px] text-slate-500">Configured routing queues and capacity</p>
            </div>
            <Link to="/queues" className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
              All <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3 overflow-y-auto max-h-64 pr-1">
            {queuesLoading ? (
              <p className="text-xs text-slate-400">Loading queues...</p>
            ) : queues && queues.length > 0 ? (
              queues.map((q) => (
                <Link
                  key={q.id}
                  to={`/queues/${q.id}`}
                  className="block p-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">{q.name}</span>
                    <StatusBadge status={q.kind} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1 font-mono">
                    <span>{q.code}</span>
                    <span>Cap: {q.capacity}</span>
                  </div>
                </Link>
              ))
            ) : (
              <p className="text-xs text-slate-400">No queues configured.</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Audit Activity */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Recent Operational Audit Activity</h2>
            <p className="text-[11px] text-slate-500">Immutable record of case creation, claiming, and decisions</p>
          </div>
          <Link to="/audit-log" className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1">
            View Audit Log <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="divide-y divide-slate-100">
          {auditsLoading ? (
            <p className="text-xs text-slate-400 py-3">Loading audit records...</p>
          ) : audits && audits.length > 0 ? (
            audits.slice(0, 6).map((item) => (
              <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                    {item.action}
                  </span>
                  <span className="text-slate-600 truncate max-w-md">Target: {item.target}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
                  <span>Actor: {item.actor.slice(0, 8)}...</span>
                  <span>{new Date(item.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-400 py-3">No audit activity recorded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};
