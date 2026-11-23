import { ModerateWorkspace } from '../components/continuous/ModerateWorkspace';
import { CaseEvidencePanel } from '../components/continuous/CaseEvidencePanel';
import { DecisionForm } from '../components/continuous/DecisionForm';
import { policyFor, type Reservation } from '../components/continuous/workspaceContract';
import { CaseClarification } from '../components/policy/Clarifications';
import { reporterExplanation } from '../components/policy/policyApi';
import '../components/continuous/workspace.css';
import type { AuxSnapshot } from '../attendanceApi';
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Clock3,
  Eye,
  Info,
  LockKeyhole,
  Radio,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  errorText,
  useAction,
  useData,
  canConfigureQueue,
  type Actor,
  type Queue,
} from "../api";
import { formatAht } from "../components/GlobalAuxControl";
import { PinnedPolicyReference } from "../components/policy/PolicyReference";
import { usePolicyQuery, type PinnedPolicy } from "../components/policy/policyApi";

const isQaEligible = (actor?: Actor | null) =>
  Boolean(
    actor?.superAdmin ||
      ["ADMIN", "MODERATION_ADMIN", "QA_REVIEWER", "QA_SUPERVISOR", "QA_AUDITOR", "TEAM_LEAD"].includes(
        actor?.role ?? "",
      ),
  );
type Metrics = {
  pending: number;
  inProgress: number;
  completed: number;
  completedToday: number;
  activeModerators: number;
  subscribedModerators: number;
  ahtSeconds: number | null;
  reportingTimezone: string;
};
type QueueRow = Pick<
  Queue,
  "id" | "code" | "name" | "description" | "status"
> & { subscribed: boolean; lob: string; metrics: Metrics };
type Case = {
  id: string;
  code: string;
  category: string;
  status: string;
  trigger: string;
  createdAt: string;
  updatedAt: string;
};
type CaseDetail = Case & {
  report?: { category: string; notes?: string | null };
  admission: {
    facility: {
      googlePlaceId: string | null;
      evidence: { source: string; finding: string; reference: string }[];
    };
  };
  tasks: { queueVersion: number; form: Queue["config"] }[];
};
const label = (value: string) =>
  value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (char) => char.toUpperCase());
function useLive<T>(url: string) {
  const actor = useData<Actor>("/session").data;
  return useQuery({
    queryKey: ["queue-live", actor?.userId, actor?.lob, url],
    queryFn: async () => (await api.get<T>(url)).data,
    enabled: Boolean(actor),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    retry: false,
  });
}
function MetricsGrid({ value }: { value: Metrics }) {
  const values = [
    ["Pending", value.pending],
    ["In progress", value.inProgress],
    ["Completed", value.completed],
    ["Completed today", value.completedToday],
    ["Active moderators", value.activeModerators],
    ["Subscribed", value.subscribedModerators],
    ["AHT", formatAht(value.ahtSeconds)],
  ];
  return (
    <div className="wf-metrics">
      {values.map(([title, amount]) => (
        <div className="wf-panel" key={title}>
          <h2>{title}</h2>
          <strong>{amount}</strong>
        </div>
      ))}
    </div>
  );
}
function ErrorPanel({
  error,
  retry,
}: {
  error: unknown;
  retry: () => unknown;
}) {
  return (
    <div className="wf-panel" role="alert">
      {errorText(error)} <button onClick={retry}>Retry</button>
    </div>
  );
}
export function QueueWorklist({ subscribed }: { subscribed: boolean }) {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const actor = useData<Actor>("/session").data;
  const canQa = isQaEligible(actor);
  const completed = subscribed && typeof state?.moderationCompleted === "number" ? state.moderationCompleted : null;
  const page = Math.min(
    10000,
    Math.max(1, Math.trunc(Number(params.get("page")) || 1)),
  );
  const query = useLive<QueueRow[]>(
      (subscribed ? "/my-queues" : "/available-queues") + "?page=" + page,
    ),
    action = useAction();
  return (
    <>
      <div className="wf-heading">
        <div>
          <h1>{subscribed ? "My Subscribed Queues" : "Available Queues"}</h1>
          <p>Queues permitted for your line of business.</p>
        </div>
        <Link
          className="wf-primary"
          to={subscribed ? "/available-queues" : "/my-queues"}
        >
          {subscribed ? "Browse Available Queues" : "My Subscribed Queues"}
        </Link>
      </div>
      {query.isPending && <p role="status">Loading queues…</p>}
      {completed !== null && <p className="wf-panel" role="status">
        Moderation session ended. Completed cases: <strong>{completed}</strong>.
      </p>}
      {query.error ? (
        <ErrorPanel error={query.error} retry={query.refetch} />
      ) : query.data?.length ? (
        query.data.map((queue) => (
          <section className="wf-panel" key={queue.id}>
            <div className="wf-heading">
              <div>
                <h2>{queue.name}</h2>
                <p>
                  {queue.code} · {queue.lob} · {label(queue.status)}
                </p>
                {queue.description && <p>{queue.description}</p>}
              </div>
              <div className="wf-actions">
                {queue.subscribed && (
                  <Link
                    className="wf-primary"
                    to={"/queues/" + queue.id + "/moderate"}
                  >
                    Moderate
                  </Link>
                )}
                <Link
                  className="wf-breadcrumb"
                  to={"/queues/" + queue.id + "/cases"}
                >
                  View
                </Link>
                {canQa && (
                  <Link
                    className="wf-breadcrumb"
                    to={"/qa?queueId=" + queue.id}
                    title="QA: Review submitted cases for this queue"
                  >
                    QA
                  </Link>
                )}
                <button
                  disabled={action.isPending}
                  onClick={() =>
                    action.mutate({
                      url: "/queues/" + queue.id + "/subscribe",
                      method: queue.subscribed ? "delete" : "post",
                    })
                  }
                >
                  {queue.subscribed ? "Unsubscribe" : "Subscribe"}
                </button>
              </div>
            </div>
            <MetricsGrid value={queue.metrics} />
          </section>
        ))
      ) : (
        query.data && (
          <section className="wf-panel">
            <p>
              {subscribed
                ? "You haven't subscribed to any queues yet."
                : "No active queues are available for your LOB."}
            </p>
          </section>
        )
      )}
      {query.data && (page > 1 || query.data.length === 25) && (
        <div className="wf-pagination">
          <span>Page {page}</span>
          <button
            disabled={page === 1}
            onClick={() => setParams({ page: String(page - 1) })}
          >
            Previous
          </button>
          <button
            disabled={page === 10000 || query.data.length < 25}
            onClick={() => setParams({ page: String(page + 1) })}
          >
            Next
          </button>
        </div>
      )}
      {action.error && <p role="alert">{errorText(action.error)}</p>}
    </>
  );
}
export function QueueOverview() {
  const { id } = useParams(),
    queue = useLive<Queue & { organization?: { name: string } }>(
      "/queues/" + id,
    ),
    metrics = useLive<Metrics>("/queues/" + id + "/metrics");
  const activity = useLive<{
    arrivals: Case[];
    completions: Case[];
    intake: { day: string; count: number }[];
  }>("/queues/" + id + "/activity");
  const grants = useLive<{ lob: { id: string; name: string } }[]>(
    "/queues/" + id + "/lobs",
  );
  const actor = useData<Actor>("/session").data;
  if (queue.error)
    return <ErrorPanel error={queue.error} retry={queue.refetch} />;
  if (!queue.data) return <p role="status">Loading queue…</p>;
  const item = queue.data;
  return (
    <>
      <Link to="/queues" className="wf-breadcrumb">
        Queues
      </Link>
      <div className="wf-heading">
        <div>
          <h1>{item.name}</h1>
          <p>
            {item.code} ·{" "}
            {item.organization?.name ?? "Legacy queue awaiting ownership"} ·{" "}
            {label(item.kind)} · {label(item.status)} · Version {item.version}
          </p>
          <p>{item.description}</p>
        </div>
        <div className="wf-actions">
          <Link className="wf-primary" to={"/queues/" + id + "/cases"}>
            View cases
          </Link>
          {isQaEligible(actor) && (
            <Link className="wf-breadcrumb" to={"/qa?queueId=" + id} title="QA: Review submitted cases for this queue">
              QA
            </Link>
          )}
          {canConfigureQueue(actor, item) && (
            <Link className="wf-breadcrumb" to={"/queues/" + id + "/settings"}>
              Configure queue
            </Link>
          )}
        </div>
      </div>
      {grants.data && (
        <section className="wf-panel">
          <h2>Authorized LOBs</h2>
          <p>
            {grants.data.map((g) => g.lob.name).join(", ") || "No LOB grants"}
          </p>
        </section>
      )}
      {metrics.error ? (
        <ErrorPanel error={metrics.error} retry={metrics.refetch} />
      ) : (
        metrics.data && (
          <>
            <p className="mb-3">
              Reporting day · {metrics.data.reportingTimezone}
            </p>
            <MetricsGrid value={metrics.data} />
          </>
        )
      )}
      {activity.data?.intake.some((day) => day.count > 0) && (
        <section className="wf-panel">
          <h2>Case arrivals over seven days</h2>
          <div
            style={{ height: 180 }}
            role="img"
            aria-label="Case arrivals over seven days"
          >
            <ResponsiveContainer>
              <BarChart data={activity.data.intake}>
                <XAxis
                  dataKey="day"
                  tickFormatter={(day) => String(day).slice(5)}
                />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#214fb6" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
      {activity.error ? (
        <ErrorPanel error={activity.error} retry={activity.refetch} />
      ) : (
        activity.data && (
          <div className="wf-dashboard-grid">
            {(
              [
                ["Recent arrivals", activity.data.arrivals],
                ["Recent completions", activity.data.completions],
              ] as const
            ).map(([title, rows]) => (
              <section className="wf-panel" key={title}>
                <h2>{title}</h2>
                {rows.length ? (
                  <ol className="wf-feed">
                    {rows.map((row) => (
                      <li key={row.id}>
                        <Link
                          className="wf-breadcrumb"
                          to={"/queues/" + id + "/cases/" + row.id}
                        >
                          {row.code}
                        </Link>
                        <span>{label(row.status)}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No activity recorded.</p>
                )}
              </section>
            ))}
          </div>
        )
      )}
    </>
  );
}
export function QueueCases() {
  const { id } = useParams(),
    [params, setParams] = useSearchParams();
  const actor = useData<Actor>("/session").data;
  const canQa = isQaEligible(actor);
  const query = useLive<{
    items: Case[];
    total: number;
    totalPages: number;
    page: number;
  }>("/queues/" + id + "/cases?" + params);
  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  }
  return (
    <>
      <Link className="wf-breadcrumb" to={"/queues/" + id}>
        Queue overview
      </Link>
      <div className="wf-heading">
        <div>
          <h1>Queue cases</h1>
          <p>Inspect incoming, in-review, and submitted cases for this queue.</p>
        </div>
        {canQa && (
          <div className="wf-actions">
            <Link className="wf-primary" to={"/qa?queueId=" + id}>
              QA Reviews
            </Link>
          </div>
        )}
      </div>
      <section className="wf-panel">
        <div className="wf-form">
          <label>
            Case ID
            <input
              value={params.get("search") ?? ""}
              onChange={(e) => change("search", e.target.value)}
            />
          </label>
          <label>
            Status
            <select
              value={params.get("status") ?? ""}
              onChange={(e) => change("status", e.target.value)}
            >
              <option value="">All statuses</option>
              {[
                "QUEUED",
                "IN_REVIEW",
                "PENDING_QA",
                "AWAITING_EVIDENCE",
                "ESCALATED",
                "APPROVED",
                "REJECTED",
                "CLOSED",
                "REOPENED",
              ].map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Case type
            <input
              value={params.get("category") ?? ""}
              onChange={(e) => change("category", e.target.value)}
            />
          </label>
          <label>
            Order
            <select
              value={params.get("sort") ?? "newest"}
              onChange={(e) => change("sort", e.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="priority">Priority</option>
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={params.get("from") ?? ""}
              onChange={(e) => change("from", e.target.value)}
            />
          </label>
          <label>
            Through
            <input
              type="date"
              value={params.get("through") ?? ""}
              onChange={(e) => change("through", e.target.value)}
            />
          </label>
        </div>
      </section>
      {query.error ? (
        <ErrorPanel error={query.error} retry={query.refetch} />
      ) : query.data ? (
        <section className="wf-panel">
          <div className="wf-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Arrived</th>
                  {canQa && <th>QA</th>}
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link to={"/queues/" + id + "/cases/" + row.id}>
                        {row.code}
                      </Link>
                    </td>
                    <td>{label(row.category)}</td>
                    <td>{label(row.status)}</td>
                    <td>{label(row.trigger)}</td>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    {canQa && (
                      <td>
                        <Link
                          to={"/qa?queueId=" + id}
                          style={{ color: '#2563eb', fontWeight: 600, fontSize: '0.85rem' }}
                        >
                          Review in QA
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!query.data.total && (
            <p className="wf-empty">No cases match these filters.</p>
          )}
          <div className="wf-pagination">
            <span>
              {query.data.total} cases · Page {query.data.page} of{" "}
              {query.data.totalPages}
            </span>
            <button
              disabled={query.data.page === 1}
              onClick={() => change("page", String(query.data!.page - 1))}
            >
              Previous
            </button>
            <button
              disabled={query.data.page >= query.data.totalPages}
              onClick={() => change("page", String(query.data!.page + 1))}
            >
              Next
            </button>
          </div>
        </section>
      ) : (
        <p role="status">Loading cases…</p>
      )}
    </>
  );
}
export function QueueCaseView() {
  const { id, caseId } = useParams();
  const navigate = useNavigate();
  const actor = useData<Actor>("/session").data;
  const canQa = isQaEligible(actor);

  const url = id ? "/queues/" + id + "/cases/" + caseId : "/cases/" + caseId;
  const query = useLive<any>(url);

  const effectiveQueueId = id ?? query.data?.tasks?.[0]?.queueId;
  const policies = usePolicyQuery<{ rows: { version: PinnedPolicy | null }[] }>(
    actor?.userId ?? "",
    "/policies/effective",
    { queueId: effectiveQueueId },
    Boolean(effectiveQueueId && actor?.organizationId),
  );
  const guidance = policies.data?.rows[0]?.version;
  const [viewNotice, setViewNotice] = useState<string | null>(null);

  if (query.error)
    return <ErrorPanel error={query.error} retry={query.refetch} />;
  if (!query.data) return <p role="status">Loading case…</p>;

  const item = query.data;
  const queueId = effectiveQueueId || "queue-view";
  const queueName = item.queue?.name || item.tasks?.[0]?.queue?.name || "Moderation queue";

  const viewReservation: Reservation = {
    id: "view-" + item.id,
    queueId: queueId,
    reservedAt: item.createdAt,
    leaseExpiresAt: item.createdAt,
    pinnedPolicy: guidance ?? item.tasks?.[0]?.form?.pinnedPolicy ?? null,
    case: {
      code: item.code,
      status: item.status || "QUEUED",
      category: item.category || "REPORT",
      trigger: item.trigger || "REPORT",
      priority: item.priority ?? 50,
      createdAt: item.createdAt,
      admission: item.admission ?? (item.facilityDetails ? { facility: item.facilityDetails } : undefined),
      tasks: item.tasks,
      metadata: item.metadata ?? (item.userReport ? { report: item.userReport } : (item.report ? { report: item.report } : {})),
      attachments: item.attachments ?? [],
    },
  };

  const policy = policyFor(viewReservation) || (guidance ? {
    version: guidance.number,
    form: [],
    reviewPolicy: undefined,
    pinned: guidance,
  } : null) || (item.tasks?.[0]?.form ? {
    version: item.tasks[0]?.queueVersion,
    form: Array.isArray(item.tasks[0]?.form?.form) ? item.tasks[0].form.form : [],
    reviewPolicy: item.tasks[0]?.form?.reviewPolicy,
  } : null);

  const evidence = (viewReservation.case.admission?.facility?.evidence ?? []).filter(
    (e: any) => !e.expiresAt || Date.parse(e.expiresAt) > Date.now(),
  );

  const handleSimulatedSubmit = (e?: React.MouseEvent) => {
    e?.preventDefault();
    setViewNotice("View mode only: actions will not take any effect on case data. This is a read-only inspection.");
  };

  return (
    <div className="mw-workspace">
      <section className="mw-case-header" aria-labelledby="case-heading">
        <div>
          <p className="mw-overline">{queueName}</p>
          <h1 id="case-heading">{item.code}</h1>
          <p className="mw-muted">{label(item.category || item.trigger || "Case")}</p>
        </div>
        <div className="mw-header-metrics">
          <div className="mw-handling">
            <span><Eye size={15} /> Case handling</span>
            <strong role="timer" aria-label="Case handling seconds" data-testid="case-timer">View mode</strong>
          </div>
          <div>
            <span>Status: <strong>{label(item.status)}</strong></span>
            <span className="mw-pill">{item.status?.replaceAll("_", " ")}</span>
          </div>
          <div>
            <span><Radio size={15} /> Connected</span>
            <span className="mw-lease-warning"><LockKeyhole size={14} /> Read-only view</span>
          </div>
        </div>
      </section>

      <div className="mw-announcement" role="status">
        Read-only view · Complete moderation workspace parity. Form inputs and submit options are active for inspection, but actions will not take any effect.
      </div>

      {viewNotice && (
        <div className="mw-alert" role="alert">
          <ShieldAlert size={18} />
          <div>
            <strong>Notice: Action Ignored</strong>
            <p>{viewNotice}</p>
          </div>
        </div>
      )}

      {canQa && item.qaSample?.id && (
        <div className="mw-alert" style={{ background: '#f0f9ff', borderColor: '#bae6fd', color: '#0369a1' }}>
          <ShieldCheck size={18} />
          <div>
            <strong>Sampled for QA Review</strong>
            <p>
              This case was sampled for quality audit.{" "}
              <Link to={`/qa/reviews/${item.qaSample.id}`} style={{ fontWeight: 600, textDecoration: 'underline' }}>
                Open in QA Review Workspace →
              </Link>
            </p>
          </div>
        </div>
      )}

      <div>
        <DecisionForm
          key={viewReservation.id}
          policy={policy}
          evidence={evidence}
          frozen={false}
          clarification={(policy as any)?.pinned && <CaseClarification reservationId={viewReservation.id} expired={true} />}
          hasReporterExplanation={viewReservation.case.trigger === "REPORT" && reporterExplanation(viewReservation.case.metadata)}
          context={
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <CaseEvidencePanel reservation={viewReservation} serverNow={Date.now()} />
              {item.reviews && item.reviews.length > 0 && (
                <section className="mw-panel" aria-labelledby="submitted-reviews-heading">
                  <div className="mw-panel-heading">
                    <Clock3 size={18} />
                    <h2 id="submitted-reviews-heading">Submitted reviews ({item.reviews.length})</h2>
                  </div>
                  <div className="mw-body">
                    {item.reviews.map((rev: any, idx: number) => (
                      <div key={rev.id || idx} style={{ borderBottom: idx < item.reviews.length - 1 ? '1px solid #e2e8f0' : 'none', padding: '0.6rem 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="mw-pill" style={{ fontWeight: 700, background: rev.action === 'APPROVE' ? '#dcfce7' : rev.action === 'REJECT' ? '#fee2e2' : '#fef9c3', color: rev.action === 'APPROVE' ? '#166534' : rev.action === 'REJECT' ? '#991b1b' : '#854d0e' }}>
                            {rev.action}
                          </span>
                          <span className="mw-muted" style={{ fontSize: '0.8rem' }}>
                            {rev.createdAt ? new Date(rev.createdAt).toLocaleString() : ''}
                          </span>
                        </div>
                        {rev.reviewer && (
                          <p style={{ fontSize: '0.85rem', marginTop: '0.35rem', color: '#475569' }}>
                            Moderator: <strong>{rev.reviewer.name || rev.reviewer.email}</strong>
                          </p>
                        )}
                        {rev.reason && (
                          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem', fontStyle: 'italic', color: '#1e293b' }}>
                            "{rev.reason}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          }
        >
          {() => (
            <footer className="mw-action-bar" aria-label="Moderation actions">
              <button
                type="button"
                className="mw-release"
                onClick={() => {
                  if (id) navigate(`/queues/${id}/cases`);
                  else navigate(-1);
                }}
              >
                ← Back to Queue
              </button>
              <div className="mw-actions mw-submit-buttons">
                <button
                  type="button"
                  onClick={handleSimulatedSubmit}
                  title="View mode only — actions take no effect"
                >
                  Submit &amp; Leave
                </button>
                <button
                  type="button"
                  className="mw-primary"
                  id="mw-submit"
                  onClick={handleSimulatedSubmit}
                  title="View mode only — actions take no effect"
                >
                  Submit → Next <ArrowRight size={16} />
                </button>
              </div>
            </footer>
          )}
        </DecisionForm>
        <details className="mw-shortcuts">
          <summary>Keyboard shortcuts</summary>
          <p>Alt + Shift + D focuses the decision. T focuses tag search. P opens the policy. S focuses Submit → Next.</p>
        </details>
      </div>
    </div>
  );
}
export function ModeratePrerequisites() {
  const actor = useData<Actor>('/session').data;
  const aux = useOutletContext<AuxSnapshot | undefined>();
  const { id } = useParams();
  const queue = useLive<Queue>('/queues/' + id);
  const metricsQuery = useLive<Metrics>('/queues/' + id + '/metrics');

  if (queue.error && !queue.data)
    return <ErrorPanel error={queue.error} retry={queue.refetch} />;
  if (!queue.data) return <p role="status">Checking queue access…</p>;

  const hasPendingCases = (metricsQuery.data?.pending ?? (queue.data as any).metrics?.pending ?? 0) > 0;

  return <ModerateWorkspace key={queue.data.id} queue={queue.data} aux={aux} actorId={actor?.userId} hasPendingCases={hasPendingCases} />;
}
