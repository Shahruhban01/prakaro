import { ModerateWorkspace } from '../components/continuous/ModerateWorkspace';
import type { AuxSnapshot } from '../attendanceApi';
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
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
        <h1>Queue cases</h1>
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
  const { id, caseId } = useParams(),
    query = useLive<CaseDetail>("/queues/" + id + "/cases/" + caseId);
  const actor = useData<Actor>("/session").data;
  const policies = usePolicyQuery<{ rows: { version: PinnedPolicy | null }[] }>(
    actor?.userId ?? "", "/policies/effective", { queueId: id }, Boolean(id && actor?.organizationId),
  );
  const guidance = policies.data?.rows[0]?.version;
  if (query.error)
    return <ErrorPanel error={query.error} retry={query.refetch} />;
  if (!query.data) return <p role="status">Loading case…</p>;
  const item = query.data;
  return (
    <>
      <Link className="wf-breadcrumb" to={"/queues/" + id + "/cases"}>
        Queue cases
      </Link>
      <div className="wf-heading">
        <div>
          <h1>{item.code}</h1>
          <p>
            {label(item.status)} · {label(item.category)}
          </p>
        </div>
        <span className="wf-badge">Read-only view</span>
      </div>
      <div className="wf-dashboard-grid">
        <section className="wf-panel">
          {item.report && (
            <div className="pb-4">
              <h2>User report</h2>
              <p>{label(item.report.category)}</p>
              {item.report.notes && (
                <p className="whitespace-pre-wrap">{item.report.notes}</p>
              )}
            </div>
          )}
          <h2>Independent evidence</h2>
          {item.admission.facility.evidence.length ? (
            item.admission.facility.evidence.map((e, i) => (
              <div className="border-b py-2" key={i}>
                <strong>{label(e.finding)}</strong>
                <p>
                  {label(e.source)} · {e.reference}
                </p>
              </div>
            ))
          ) : (
            <p>No current independent evidence.</p>
          )}
        </section>
        <section className="wf-panel">
          <h2>Review form</h2>
          {guidance && <div className="policy-stack"><p>Current queue guidance for your line of business</p>
            <PinnedPolicyReference policy={guidance} /></div>}
          {!guidance && <>
          {item.tasks[0]?.form.reviewPolicy && (
            <p className="whitespace-pre-wrap pb-3">
              {item.tasks[0].form.reviewPolicy}
            </p>
          )}
          {item.tasks[0]?.form.form.length ? (
            <ul>
              {item.tasks[0].form.form.map((q) => (
                <li className="py-2" key={q.key}>
                  {q.label}
                  {q.required ? " (required)" : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p>No review questions configured.</p>
          )}
          </>}
        </section>
      </div>
    </>
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
