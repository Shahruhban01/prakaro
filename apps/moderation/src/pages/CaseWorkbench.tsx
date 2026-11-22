import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  UserCheck,
  UserX,
  Plus,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Send,
  Save,
  Clock,
  ExternalLink,
  Info,
  MapPin,
  Copy,
  Check,
  Car,
  Navigation,
} from 'lucide-react';
import type { Detail, Actor } from '../api';
import { useData, useAction, errorText } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { PriorityBadge } from '../components/PriorityBadge';

const EVIDENCE_FINDINGS = [
  'CONFIRMED_PARKING',
  'CONFIRMED_NON_PARKING',
  'MARKED_PARKING_BAYS',
  'DEDICATED_PARKING_ENTRANCE',
  'PUBLIC_ACCESS',
  'PRIVATE_ACCESS',
  'CUSTOMERS_ONLY_ACCESS',
  'RESTRICTED_ACCESS',
  'FREE_PARKING',
  'PAID_PARKING',
  'PUBLISHED_HOURS',
  'NO_PUBLISHED_HOURS',
];

export const CaseWorkbench: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { data: c, isLoading, refetch } = useData<Detail>(`/cases/${id}`);
  const { data: session } = useData<Actor>('/session');
  const action = useAction();

  // Form state
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [decisionAction, setDecisionAction] = useState<
    'APPROVE' | 'REJECT' | 'REQUEST_MORE_EVIDENCE' | 'ESCALATE' | 'SAVE_DRAFT'
  >('APPROVE');

  // New evidence form state
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [evSource, setEvSource] = useState<'PRAKARO_AUDIT' | 'PARKING_OPERATOR' | 'PUBLIC_AUTHORITY'>(
    'PRAKARO_AUDIT',
  );
  const [evFinding, setEvFinding] = useState('CONFIRMED_PARKING');
  const [evRef, setEvRef] = useState('');
  const [evDays, setEvDays] = useState(30);
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center text-xs text-slate-500">
        Loading case workbench...
      </div>
    );
  }

  if (!c) {
    return (
      <div className="p-8 text-center text-xs text-red-600">
        Case not found or unauthorized to view this case.
      </div>
    );
  }

  const isOwner = c.owner === session?.userId;
  const isClaimable =
    !c.owner || (c.leaseUntil && new Date(c.leaseUntil) < new Date()) || isOwner;
  const activeTask = c.tasks?.[0];
  const formQuestions = (activeTask?.form as any)?.form || [];
  const facilityEvidence = (c as any).evidence || c.admission?.facility?.evidence || [];
  const aiRuns = (c as any).runs || c.admission?.facility?.runs || [];

  // Facility and metadata details
  const googlePlaceId =
    c.facilityDetails?.googlePlaceId ||
    c.admission?.facility?.googlePlaceId ||
    c.facilityId;
  const facilityName =
    c.facilityDetails?.displayName ||
    c.admission?.facility?.displayName ||
    'Parking Facility';
  const facilityAddress =
    c.facilityDetails?.formattedAddress ||
    c.admission?.facility?.formattedAddress ||
    'Address not recorded';
  const lat = c.facilityDetails?.latitude ?? c.admission?.facility?.latitude ?? null;
  const lng = c.facilityDetails?.longitude ?? c.admission?.facility?.longitude ?? null;
  const mapsUrl =
    c.facilityDetails?.googleMapsUrl ||
    (googlePlaceId
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(facilityName)}&query_place_id=${googlePlaceId}`
      : null);
  const report = c.userReport || c.facilityDetails?.userReport;
  const meta = c.facilityDetails?.placeMetadata || c.admission?.facility?.placeMetadata;

  // Fallback verification checklist if queue has no custom question schema
  const defaultQuestions = [
    {
      key: 'confirmed_status',
      label: 'Verified Facility Status',
      required: true,
      type: 'SELECT',
      options: ['CONFIRMED_PARKING', 'CONFIRMED_NON_PARKING', 'UNCONFIRMED'],
    },
    {
      key: 'access_type',
      label: 'Access Permission',
      required: true,
      type: 'SELECT',
      options: ['PUBLIC', 'CUSTOMERS_ONLY', 'PRIVATE', 'RESTRICTED'],
    },
    {
      key: 'pricing_type',
      label: 'Pricing Tier',
      required: true,
      type: 'SELECT',
      options: ['FREE', 'PAID', 'MIXED', 'UNKNOWN'],
    },
    {
      key: 'operational_status',
      label: 'Operational Status',
      required: false,
      type: 'SELECT',
      options: ['OPERATIONAL', 'TEMPORARILY_CLOSED', 'PERMANENTLY_CLOSED'],
    },
  ];
  const effectiveQuestions = formQuestions.length > 0 ? formQuestions : defaultQuestions;

  const handleCopyPlaceId = () => {
    if (googlePlaceId) {
      navigator.clipboard.writeText(googlePlaceId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClaim = () => {
    action.mutate(
      { url: `/cases/${c.id}/claim`, method: 'post' },
      { onSuccess: () => refetch() },
    );
  };

  const handleRelease = () => {
    action.mutate(
      { url: `/cases/${c.id}/release`, method: 'post' },
      { onSuccess: () => refetch() },
    );
  };

  const handleAddEvidence = (e: React.FormEvent) => {
    e.preventDefault();
    const expiresAt = new Date(Date.now() + evDays * 86400000).toISOString();
    action.mutate(
      {
        url: `/cases/${c.id}/evidence`,
        method: 'post',
        data: {
          source: evSource,
          finding: evFinding,
          reference: evRef,
          expiresAt,
        },
      },
      {
        onSuccess: () => {
          setShowAddEvidence(false);
          setEvRef('');
          refetch();
        },
      },
    );
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTask) return;

    action.mutate(
      {
        url: `/cases/${c.id}/reviews`,
        method: 'post',
        data: {
          taskId: activeTask.id,
          revision: c.revision,
          action: decisionAction,
          answers,
          evidenceIds: selectedEvidence,
          reason,
        },
      },
      {
        onSuccess: () => {
          refetch();
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Breadcrumb & Quick Info Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-lg">
        <div className="flex items-center gap-3">
          <Link to="/cases" className="text-slate-400 hover:text-slate-600">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-900">{c.code}</span>
              <StatusBadge status={c.status} />
              <PriorityBadge priority={c.priority} />
            </div>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
              Google Place ID: {googlePlaceId || 'Not registered'}
            </p>
          </div>
        </div>

        {/* Claim / Release Controls */}
        <div className="flex items-center gap-2">
          {isOwner ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200 flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5" /> Claimed by you
              </span>
              <button
                type="button"
                className="btn-secondary text-xs py-1.5 px-3 text-red-600 hover:bg-red-50"
                onClick={handleRelease}
                disabled={action.isPending}
              >
                <UserX className="w-3.5 h-3.5" /> Release Lease
              </button>
            </div>
          ) : isClaimable ? (
            <button
              type="button"
              className="btn-primary text-xs py-1.5 px-3"
              onClick={handleClaim}
              disabled={action.isPending}
            >
              <UserCheck className="w-3.5 h-3.5" /> Claim Task
            </button>
          ) : (
            <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded">
              Claimed by {c.owner?.slice(0, 10)}...
            </span>
          )}
        </div>
      </div>

      {/* Facility Inspection & Detail Hero Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-blue-50 text-blue-700 rounded-lg">
                <Car className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-base font-bold text-slate-900 leading-tight">
                  {facilityName}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-0.5">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {facilityAddress}
                  </span>
                  {lat !== null && lng !== null && (
                    <span className="font-mono text-[11px] text-slate-400">
                      ({lat.toFixed(5)}, {lng.toFixed(5)})
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {googlePlaceId && (
              <button
                type="button"
                onClick={handleCopyPlaceId}
                className="btn-secondary text-xs py-1.5 px-2.5 flex items-center gap-1.5 font-mono text-[11px]"
                title="Copy Google Place ID"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                {copied ? 'Copied' : (googlePlaceId.length > 20 ? googlePlaceId.slice(0, 18) + '...' : googlePlaceId)}
              </button>
            )}
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Open in Google Maps / Street View</span>
                <ExternalLink className="w-3 h-3 opacity-70" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* User Problem Report Alert Banner */}
      {(report || c.trigger === 'REPORT') && (
        <div className="p-4 bg-amber-50/90 border-l-4 border-amber-500 border-y border-r border-amber-200 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wide">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>User Problem Report: {report?.category?.replace(/_/g, ' ') || c.category.replace(/_/g, ' ')}</span>
            </div>
            {report?.reportedAt && (
              <span className="text-[11px] text-amber-700 font-mono">
                Reported {new Date(report.reportedAt).toLocaleString()}
              </span>
            )}
          </div>
          <div className="text-xs text-amber-950 font-medium bg-white/80 p-3 rounded border border-amber-200/60">
            <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider mb-1">
              User Submitted Feedback:
            </span>
            {report?.notes ? (
              <p className="italic text-slate-800 font-normal">"{report.notes}"</p>
            ) : (
              <p className="text-slate-500 italic">User flagged this facility for review under category {report?.category || c.category}.</p>
            )}
            {report?.reporterId && (
              <span className="text-[10px] text-slate-400 font-mono block mt-2">
                Reporter ID: {report.reporterId}
              </span>
            )}
          </div>
        </div>
      )}

      {action.error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorText(action.error)}</span>
        </div>
      )}

      {/* 3-Panel Main Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* PANEL 1: Context & Trigger (Cols: 3) */}
        <div className="lg:col-span-3 space-y-4">
          <div className="card p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1.5">
              Case Context
            </h2>
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Category</span>
                <span className="font-semibold text-slate-800">{c.category.replace(/_/g, ' ')}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Search Trigger</span>
                <span className="font-semibold text-slate-800">{c.trigger}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">User Demand Appearances</span>
                <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  {c.admission?.demand ?? 1} distinct searches
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">Created Date</span>
                <span className="font-mono text-slate-600">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </div>
              {c.leaseUntil && (
                <div>
                  <span className="text-slate-400 block text-[11px]">Lease Deadline</span>
                  <span className="font-mono text-amber-700">
                    {new Date(c.leaseUntil).toLocaleTimeString()}
                  </span>
                </div>
              )}
            </div>

            {meta && (
              <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs">
                <span className="text-slate-400 block text-[11px] font-semibold uppercase">
                  Facility Discovered Attributes
                </span>
                {meta.accessType && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Access:</span>
                    <span className="font-semibold text-slate-800 capitalize">{meta.accessType}</span>
                  </div>
                )}
                {meta.pricingType && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pricing:</span>
                    <span className="font-semibold text-slate-800 capitalize">{meta.pricingType}</span>
                  </div>
                )}
                {meta.openingStatus && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Status:</span>
                    <span className="font-semibold text-slate-800 capitalize">{meta.openingStatus}</span>
                  </div>
                )}
                {meta.hourlyRate !== undefined && meta.hourlyRate !== null && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Hourly Rate:</span>
                    <span className="font-semibold text-slate-800 font-mono">
                      {meta.currency || '$'}{meta.hourlyRate}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1.5">
              Assigned Queues
            </h2>
            <div className="space-y-2 text-xs">
              {c.tasks?.map((t) => (
                <div key={t.id} className="p-2 bg-slate-50 rounded border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{t.queue?.name || t.queueId}</span>
                    <span className="font-mono text-[10px] text-slate-500">{t.queue?.code || ''}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    SLA: {t.deadline ? new Date(t.deadline).toLocaleDateString() : 'None'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PANEL 2: Independent Evidence (Cols: 5) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Authorized Evidence ({facilityEvidence.length})
                </h2>
                <p className="text-[11px] text-slate-500">
                  Independently verified physical, operator, or authority findings.
                </p>
              </div>
              {isOwner && (
                <button
                  type="button"
                  className="btn-secondary text-xs py-1 px-2.5"
                  onClick={() => setShowAddEvidence(!showAddEvidence)}
                >
                  <Plus className="w-3.5 h-3.5" /> Add Evidence
                </button>
              )}
            </div>

            {/* Add Evidence Sub-form */}
            {showAddEvidence && (
              <form
                onSubmit={handleAddEvidence}
                className="p-3 bg-blue-50/50 border border-blue-200 rounded-lg space-y-2 text-xs"
              >
                <div className="font-bold text-blue-900">Record New Independent Evidence</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Source</label>
                    <select
                      className="w-full px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                      value={evSource}
                      onChange={(e: any) => setEvSource(e.target.value)}
                    >
                      <option value="PRAKARO_AUDIT">PRAKARO_AUDIT (Field visit)</option>
                      <option value="PARKING_OPERATOR">PARKING_OPERATOR (Official operator)</option>
                      <option value="PUBLIC_AUTHORITY">PUBLIC_AUTHORITY (Municipal record)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-0.5">Finding</label>
                    <select
                      className="w-full px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                      value={evFinding}
                      onChange={(e) => setEvFinding(e.target.value)}
                    >
                      {EVIDENCE_FINDINGS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                    Reference / Document / Field Notes
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                    placeholder="e.g. Audit photo batch #401, on-site signage confirmed"
                    value={evRef}
                    onChange={(e) => setEvRef(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-500">Validity: {evDays} days</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-secondary text-[11px] py-1 px-2"
                      onClick={() => setShowAddEvidence(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary text-[11px] py-1 px-3">
                      Save Evidence
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Evidence items list */}
            <div className="space-y-2.5 overflow-y-auto max-h-[500px] pr-1">
              {facilityEvidence.length > 0 ? (
                facilityEvidence.map((ev: any, idx: number) => {
                  const isChecked = selectedEvidence.includes(ev.id);
                  return (
                    <div
                      key={ev.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        isChecked ? 'bg-blue-50/50 border-blue-300' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <label className="flex items-start gap-2 cursor-pointer flex-1">
                          {isOwner && (
                            <input
                              type="checkbox"
                              className="mt-0.5 rounded border-slate-300 text-blue-600"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedEvidence(
                                  isChecked
                                    ? selectedEvidence.filter((x) => x !== ev.id)
                                    : [...selectedEvidence, ev.id],
                                );
                              }}
                            />
                          )}
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-xs text-blue-700 bg-blue-100/60 px-1.5 py-0.2 rounded">
                                E{idx + 1}
                              </span>
                              <StatusBadge status={ev.finding} />
                              <span className="text-[10px] text-slate-500 bg-slate-200/60 px-1.5 py-0.2 rounded font-mono">
                                {ev.source}
                              </span>
                            </div>
                            <p className="text-xs text-slate-800 mt-1 font-medium">{ev.reference}</p>
                            <span className="text-[10px] text-slate-400 font-mono block mt-1">
                              Expires: {new Date(ev.expiresAt).toLocaleDateString()}
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                  No independent evidence references on record. Remote moderators should request more
                  evidence or verify physical inspection records.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PANEL 3: Advisory AI Triage & Review Decision Form (Cols: 4) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Advisory AI Card */}
          <div className="card p-4 space-y-2 bg-gradient-to-br from-indigo-50/30 to-white border-indigo-200">
            <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Advisory AI Triage (Gemini)</span>
            </div>
            {aiRuns.length > 0 ? (
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-bold text-indigo-700">{aiRuns[0]!.status}</span>
                </div>
                {aiRuns[0]!.outcome && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Outcome:</span>
                    <span className="font-bold text-slate-800">{aiRuns[0]!.outcome}</span>
                  </div>
                )}
                <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-100">
                  AI predictions are non-authoritative advisory signals only. Verification requires
                  independent evidence.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 italic">
                AI evaluation not required or completed in shadow mode.
              </p>
            )}
          </div>

          {/* Review Decision Form */}
          <div className="card p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-1.5">
              Human Review Form
            </h2>

            {isOwner ? (
              <form onSubmit={handleSubmitReview} className="space-y-3 text-xs">
                {/* Form Questions (Queue Form or Standard Verification Prompts) */}
                {effectiveQuestions.map((q: any) => (
                  <div key={q.key} className="space-y-1">
                    <label className="block font-semibold text-slate-800">
                      {q.label} {q.required && <span className="text-red-500">*</span>}
                    </label>
                    {q.type === 'SELECT' ? (
                      <select
                        required={q.required}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                        value={answers[q.key] || ''}
                        onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                      >
                        <option value="">Select an answer...</option>
                        {q.options?.map((opt: string) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : q.type === 'BOOLEAN' ? (
                      <select
                        required={q.required}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                        value={answers[q.key] || 'UNKNOWN'}
                        onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                      >
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                        <option value="UNKNOWN">UNKNOWN</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        required={q.required}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                        placeholder="Enter value..."
                        value={answers[q.key] || ''}
                        onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                      />
                    )}
                  </div>
                ))}

                {/* Cited Evidence Checklist Notice */}
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600">
                  <span className="font-semibold block text-slate-800 mb-0.5">
                    Cited Evidence ({selectedEvidence.length} selected):
                  </span>
                  {selectedEvidence.length > 0 ? (
                    <span className="font-mono text-blue-700">{selectedEvidence.join(', ')}</span>
                  ) : (
                    <span className="text-amber-600">
                      Check evidence items in the center panel to cite them for this decision.
                    </span>
                  )}
                </div>

                {/* Reason Notes */}
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">
                    Decision Justification / Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={2}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                    placeholder="Document factual grounds supporting your conclusion..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>

                {/* Action Buttons */}
                <div>
                  <label className="block font-semibold text-slate-800 mb-1">Action</label>
                  <select
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs font-bold"
                    value={decisionAction}
                    onChange={(e: any) => setDecisionAction(e.target.value)}
                  >
                    <option value="APPROVE">APPROVE (Submit for QA)</option>
                    <option value="REJECT">REJECT (Submit for QA)</option>
                    <option value="REQUEST_MORE_EVIDENCE">REQUEST MORE EVIDENCE</option>
                    <option value="ESCALATE">ESCALATE TO SUPERVISOR</option>
                    <option value="SAVE_DRAFT">SAVE DRAFT</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={action.isPending}
                  className="w-full btn-primary text-xs py-2 mt-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  {action.isPending ? 'Submitting...' : 'Submit Decision'}
                </button>
              </form>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                <Info className="w-5 h-5 mx-auto text-slate-400 mb-1" />
                Claim this task above to unlock the review form and submit decisions.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
