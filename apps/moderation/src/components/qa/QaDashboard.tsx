import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import type { Actor } from "../../api";
import { errorText } from "../../api";
import { categories, optionalLabel, percent, severities, useQa, useQaAction, type Directory, type Overview, type Page, type ReviewRow } from "./qa-api";

const fields = ["organizationId", "lobId", "queueId", "teamId", "moderatorId", "auditorId", "policyVersionId", "status", "outcome", "category", "severity", "view", "from", "to", "order", "page"];
const worklists = [
  ["all", "All reviews"], ["assigned", "My assignments"], ["available", "Available"],
  ["completed", "Completed"], ["disputed", "Disputed"], ["corrections", "Pending corrections"],
];
const counts = (value: number | null | undefined) => value == null ? "Unavailable" : value.toLocaleString();

export function AccuracySummary({ data }: { data: Overview }) {
  const cards = [
    ["Finalized accuracy", percent(data.accuracy), data.evaluated + " QA evaluations"],
    ["Sampling coverage", percent(data.coverage), counts(data.sampled) + " sampled / " + counts(data.eligible) + " eligible"],
    ["Pending reviews", counts(data.pending), "Available or expired assignments"],
    ["In progress", counts(data.working), "Active assignments"],
    ["Completed reviews", counts(data.complete), data.passes + " pass · " + data.failures + " fail"],
    ["Open disputes", counts(data.disputes), "Excluded from finalized accuracy"],
    ["Pending corrections", counts(data.correctionsPending), "Awaiting authorized review"],
    ["Completed corrections", counts(data.correctionsCompleted), "Superseding decisions"],
  ];
  return <div className="qa-metrics">{cards.map(([name, value, note]) => <dl key={name} className="wf-panel qa-metric">
    <dt>{name}</dt><dd>{value}</dd><dd className="qa-muted">{note}</dd>
  </dl>)}</div>;
}

const directories = [
  ["organizationId", "Organization", "organizations"], ["lobId", "Line of business", "lobs"],
  ["queueId", "Queue", "queues"], ["moderatorId", "Original moderator", "moderators"],
  ["auditorId", "QA auditor", "auditors"], ["teamId", "Team", "teams"], ["policyVersionId", "Policy version", "policyVersions"],
] as const;
export function QaDashboard({ actor }: { actor: Actor }) {
  const nav = useNavigate();
  const [search, setSearch] = useSearchParams();
  const filters = Object.fromEntries(fields.flatMap((key) => {
    const value = search.get(key); return value ? [[key, value]] : [];
  }));
  const dashboard = useQa<Overview>(actor, "/qa/dashboard", filters);
  const reviews = useQa<Page<ReviewRow>>(actor, "/qa/reviews", filters);
  const options = useQa<Directory>(actor, "/qa/options", {}, 0);
  const action = useQaAction();
  const auditor = actor.role === "QA_REVIEWER";
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (key !== "page") next.delete("page");
    if (value) next.set(key, value); else next.delete(key);
    setSearch(next);
  };
  return <>
    <div className="qa-heading"><div><h1>Quality assurance</h1><p className="qa-muted">Audit completed moderation decisions and track finalized outcomes.</p></div>
      {dashboard.data && <span className="qa-muted">Updated {new Date(dashboard.data.generatedAt).toLocaleTimeString()}</span>}</div>
    {dashboard.isPending && <p role="status">Loading quality metrics…</p>}
    {dashboard.error && <p role="alert">{errorText(dashboard.error)}</p>}
    {dashboard.data && <AccuracySummary data={dashboard.data} />}

    <section className="wf-panel qa-worklist" aria-labelledby="qa-worklist-title">
      <div className="qa-heading"><h2 id="qa-worklist-title">QA worklist</h2>
        {auditor && <button type="button" className="wf-primary" disabled={action.pending} onClick={() =>
          void action.perform<{ id: string | null }>("/qa/reviews/claim-next", {},
            ({ id }) => id ? "Review claimed." : "No reviews are available to claim.", ({ id }) => {
            if (id) nav("/qa/reviews/" + id);
          })}>Claim next review</button>}
      </div>
      {action.error && <p role="alert">{action.error}</p>}
      {action.message && <p role="status">{action.message}</p>}
      <div className="qa-tabs" role="group" aria-label="Review views">
        {worklists.map(([value, label]) => <button key={value} type="button" aria-pressed={(filters.view || "all") === value}
          onClick={() => set("view", value)}>{label}</button>)}
      </div>
      <div className="qa-filters">
        {directories.map(([key, label, list]) => !!options.data?.[list]?.length && <label key={key}>{label}
          <select value={filters[key] ?? ""} onChange={(event) => set(key, event.target.value)}>
            <option value="">All in scope</option>{options.data[list]?.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select></label>)}
        <label>Outcome<select value={filters.outcome ?? ""} onChange={(event) => set("outcome", event.target.value)}>
          <option value="">Any outcome</option><option value="PASS">Pass</option><option value="FAIL">Fail</option>
        </select></label>
        <label>Status<select value={filters.status ?? ""} onChange={(event) => set("status", event.target.value)}>
          <option value="">Any status</option>{["PENDING","ASSIGNED","IN_REVIEW","COMPLETED","DISPUTED","CLOSED"]
            .map((value) => <option key={value} value={value}>{optionalLabel(value)}</option>)}
        </select></label>
        <label>Error category<select value={filters.category ?? ""} onChange={(event) => set("category", event.target.value)}>
          <option value="">Any category</option>{categories.map((value) => <option key={value} value={value}>{optionalLabel(value)}</option>)}
        </select></label>
        <label>Severity<select value={filters.severity ?? ""} onChange={(event) => set("severity", event.target.value)}>
          <option value="">Any severity</option>{severities.map((value) => <option key={value} value={value}>{optionalLabel(value)}</option>)}
        </select></label>
        <label>From (UTC)<input type="date" value={filters.from || ""} onChange={(event) => set("from", event.target.value)} /></label>
        <label>Through (UTC)<input type="date" value={filters.to || ""} onChange={(event) => set("to", event.target.value)} /></label>
        <label>Sort<select value={filters.order ?? "newest"} onChange={(event) => set("order", event.target.value)}>
          <option value="newest">Latest sample</option><option value="oldest">Oldest sample</option>
        </select></label>
      </div>
      {reviews.isPending && <p role="status">Loading QA reviews…</p>}
      {reviews.error && <p role="alert">{errorText(reviews.error)} <button type="button" onClick={() => void reviews.refetch()}>Retry</button></p>}
      {reviews.data && (!reviews.data.rows.length ? <p>No QA reviews match these filters.</p> :
        <div className="qa-table-wrap" tabIndex={0} role="region" aria-label="QA review worklist">
          <table><thead><tr><th>Case</th><th>Queue</th><th>Moderator</th><th>Assignment</th><th>Status</th><th>Final outcome</th></tr></thead>
            <tbody>{reviews.data.rows.map((row) => <tr key={row.id}>
              <th scope="row">{!auditor || row.assignedTo === actor.userId
                ? <Link to={"/qa/reviews/" + row.id}>{row.decision.case.code}</Link> : row.decision.case.code}
                <small>Decision v{row.decision.version}</small></th>
              <td>{row.queue.name}<small>{row.organization.name} · {row.lob.name}</small></td>
              <td>{row.moderator.name}</td><td>{row.assignee?.name ?? "Unassigned"}</td>
              <td>{optionalLabel(row.status)}</td><td>{optionalLabel(row.assessment?.finalOutcome)}</td>
            </tr>)}</tbody></table>
        </div>)}
      {reviews.data && (reviews.data.total > reviews.data.pageSize || reviews.data.page > 1) &&
        <div className="qa-actions">
          <button disabled={reviews.data.page <= 1} onClick={() => set("page", String(reviews.data!.page - 1))}>Previous</button>
          <span>Page {reviews.data.page} · {reviews.data.total} reviews</span>
          <button disabled={reviews.data.total <= reviews.data.page * reviews.data.pageSize} onClick={() => set("page", String(reviews.data!.page + 1))}>Next</button>
        </div>}
    </section>
  </>;
}

export function QaAnalytics({ actor }: { actor: Actor }) {
  const [search, setSearch] = useSearchParams();
  const dimension = search.get("dimension") ?? "moderatorId";
  const page = search.get("page") ?? "1";
  const metrics = useQa<Overview>(actor, "/qa/dashboard");
  const table = useQa<Page<{ id: string; name: string; evaluated: number; passes: number; failures: number; accuracy: number }>>(
    actor, "/qa/analytics", { dimension, page },
  );
  return <>
    <div className="qa-heading"><div><h1>Quality analytics</h1><p className="qa-muted">Accuracy describes finalized samples. Team comparisons use today’s roster.</p></div></div>
    {metrics.data && <><AccuracySummary data={metrics.data} />
      <div className="qa-grid">{[["Finalized errors by category", metrics.data.errors], ["Finalized errors by severity", metrics.data.severities]]
        .map(([title, list]) => {
          const data = (list as Overview["errors"]).map((item) => ({ ...item, name: optionalLabel(item.name) }));
          return <section className="wf-panel" key={String(title)}><h2>{String(title)}</h2>
            {data.length ? <><div className="qa-chart" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} />
                <Tooltip /><Bar dataKey="count" name="Finalized failures" fill="#315eaf" isAnimationActive={false} /></BarChart>
            </ResponsiveContainer></div><ul>{data.map((item) => <li key={item.name}>{item.name} · {item.count}</li>)}</ul></>
            : <p>No finalized failures with recorded classifications.</p>}</section>;
        })}</div></>}
    <section className="wf-panel qa-worklist"><div className="qa-heading"><h2>Accuracy by scope</h2>
      <label>Group by<select value={dimension} onChange={(event) => setSearch({ dimension: event.target.value })}>
        <option value="moderatorId">Moderator</option><option value="team">Team</option><option value="lobId">LOB</option>
        <option value="queueId">Queue</option><option value="organizationId">Organization</option>
      </select></label></div>
      {table.isPending && <p role="status">Loading quality analytics…</p>}
      {(table.error || metrics.error) && <p role="alert">{errorText(table.error ?? metrics.error)}</p>}
      {table.data?.rows.length ? <div className="qa-table-wrap"><table><thead><tr><th>Name</th><th>Evaluated</th><th>Pass</th><th>Fail</th><th>Accuracy</th></tr></thead>
        <tbody>{table.data.rows.map((row) => <tr key={row.id}><th scope="row">{row.name}</th><td>{row.evaluated}</td>
          <td>{row.passes}</td><td>{row.failures}</td><td>{percent(row.accuracy)}</td></tr>)}</tbody></table></div>
        : table.data && <p>No finalized evaluations are available.</p>}
      {table.data && (table.data.total > table.data.pageSize || table.data.page > 1) &&
        <div className="qa-actions">
          <button disabled={table.data.page === 1} onClick={() => setSearch({ dimension, page: String(table.data!.page - 1) })}>Previous</button>
          <span>Page {table.data.page}</span>
          <button disabled={table.data.total <= table.data.page * table.data.pageSize} onClick={() => setSearch({ dimension, page: String(table.data!.page + 1) })}>Next</button>
        </div>}
      {metrics.data && <p className="qa-muted">Dispute overturn rate {percent(metrics.data.overturnRate)} · Correction rate {percent(metrics.data.correctionRate)}</p>}
    </section>
  </>;
}
