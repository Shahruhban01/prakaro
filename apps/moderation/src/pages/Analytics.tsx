import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { BarChart3, Clock3 } from "lucide-react";
import { api, errorText, useData, type Actor } from "../api";
import { formatAht } from "../components/GlobalAuxControl";
import {
  amount, AuxChart, DataFreshness, localTime, MetricCard, PerformanceComparison, PerformanceTable,
  seconds, ThroughputChart, type Report,
} from "../components/analytics/Performance";
import "../components/analytics/performance.css";

const sections = {
  "": ["Operations overview", "queues"],
  "my-performance": ["My performance", "moderators"],
  teams: ["Team analytics", "teams"],
  lobs: ["LOB analytics", "lobs"],
  organizations: ["Organization analytics", "organizations"],
  queues: ["Queue analytics", "queues"],
  workforce: ["Workforce analytics", "moderators"],
} as const;
type Section = keyof typeof sections;
const presets = { today: "Today", yesterday: "Yesterday", "7days": "Last 7 days", "30days": "Last 30 days", custom: "Custom range" };
const dimensions = {
  organizations: ["organizationId", "Organization"], lobs: ["lobId", "Line of business"],
  teams: ["teamId", "Team"], queues: ["queueId", "Queue"], moderators: ["moderatorId", "Employee"],
} as const;
const keys = ["timezone", "preset", "from", "through", "organizationId", "lobId", "teamId", "queueId", "moderatorId", "status", "page", "order", "search"];

function authorizedSections(actor: Actor): Section[] {
  const leader = ["MANAGER", "MODERATION_MANAGER", "SUPERVISOR", "MOD_SUPERVISOR", "QA_SUPERVISOR"].includes(actor.role);
  const admin = actor.superAdmin || ["ADMIN", "MODERATION_ADMIN"].includes(actor.role);
  if (!leader && !admin) return ["my-performance"];
  return ["", ...(!actor.superAdmin ? ["my-performance" as const] : []), "teams", "lobs",
    ...(admin ? ["organizations" as const] : []), "queues", "workforce"];
}

export function Analytics() {
  const { data: actor } = useData<Actor>("/session");
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const sectionsAllowed = actor ? authorizedSections(actor) : [];
  const raw = pathname.split("/").filter(Boolean)[1] ?? "";
  const name = raw === "" && sectionsAllowed.length === 1 ? "my-performance" : raw as Section;
  const allowed = sectionsAllowed.includes(name);
  const [heading, dimension] = sections[name] ?? sections[""];
  const timezone = params.get("timezone") || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const activePreset = params.get("preset") ?? "7days";
  const query = Object.fromEntries(keys.flatMap((key) => {
    const value = params.get(key);
    return value ? [[key, value]] : [];
  }));
  Object.assign(query, { timezone, dimension });
  const endpoint = name === "my-performance" ? "/analytics/moderators/me" : "/analytics/overview";
  const { data: report, error, isPending, refetch, isFetching } = useQuery({
    queryKey: ["operations-analytics", actor?.userId, actor?.organizationId, actor?.role, endpoint, query],
    queryFn: async ({ signal }) => (await api.get<Report>(endpoint, { params: query, signal, timeout: 28000 })).data,
    enabled: Boolean(actor && allowed),
    refetchInterval: 20000, refetchIntervalInBackground: false, refetchOnReconnect: true,
    staleTime: 5000, retry: false,
  });

  function modify(fields: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    if (!("page" in fields)) next.delete("page");
    for (const [key, value] of Object.entries(fields)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  }
  const chartRange = report?.hourly.at(-1);
  const totals = report?.totals;
  const filterForDimension = dimensions[dimension][0];
  return <div className="pa-stack">
    <div className="wf-heading pa-heading"><div>
      <h1>{heading}</h1>
      <p>Moderation throughput, handling time, and attendance.</p>
    </div>{report && <DataFreshness report={report} failed={Boolean(error)} />}</div>
    {sectionsAllowed.length > 1 && <nav aria-label="Analytics views" className="pa-nav">
      {sectionsAllowed.map((section) => <Link key={section} aria-current={section === name ? "page" : undefined}
        to={"/analytics" + (section ? "/" + section : "")}>{sections[section][0]}</Link>)}
    </nav>}
    {actor && !allowed ? <section className="wf-panel" role="alert"><h2>Analytics access unavailable</h2>
      <p>Choose a report available to your account.</p><Link className="pa-link" to="/analytics">Back to analytics</Link></section> : <>
      <section className="wf-panel pa-filter" aria-label="Analytics filters">
        <label>Date range<select value={activePreset} onChange={(event) => modify({
          preset: event.target.value,
          from: event.target.value === "custom" ? report?.from : undefined,
          through: event.target.value === "custom" ? report?.through : undefined,
        })}>{Object.entries(presets).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        {activePreset === "custom" && <>
          <label>From<input type="date" value={params.get("from") ?? ""} onChange={(event) => modify({ from: event.target.value })} /></label>
          <label>Through<input type="date" value={params.get("through") ?? ""} onChange={(event) => modify({ through: event.target.value })} /></label>
        </>}
        <label>Reporting timezone<input key={timezone} list="pa-timezones" defaultValue={timezone}
          onBlur={(event) => { const next = event.target.value.trim(); if (next !== timezone) modify({ timezone: next }); }}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
        <datalist id="pa-timezones">{["UTC", "Asia/Kolkata", "Europe/London", "America/New_York", "Australia/Sydney"].map((zone) =>
          <option key={zone} value={zone} />)}</datalist>
        {report && Object.entries(dimensions).map(([field, [key, label]]) => {
          const options = report.options[field as keyof Report["options"]];
          if (!options.length || (name === "my-performance" && field !== "queues")) return null;
          return <label key={key}>{label}<select value={params.get(key) ?? ""} onChange={(event) =>
            modify(key === "organizationId" ? { [key]: event.target.value, lobId: undefined, teamId: undefined,
              queueId: undefined, moderatorId: undefined } : { [key]: event.target.value })}>
            <option value="">All in scope</option>
            {options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>;
        })}
        <label>Decision status<select value={params.get("status") ?? ""} onChange={(event) => modify({ status: event.target.value })}>
          <option value="">All accepted decisions</option><option value="APPROVE">Approved</option>
          <option value="REJECT">Rejected</option><option value="ESCALATE">Escalated</option>
        </select></label>
        {!!params.size && <button type="button" className="pa-reset" onClick={() => setParams({})}>Reset filters</button>}
      </section>
      {isPending && !report && <p role="status" className="wf-panel">Loading analytics…</p>}
      {error && <section className="wf-panel pa-error" role="alert">
        <strong>Analytics could not be updated</strong><p>{errorText(error)}</p>
        <button type="button" onClick={() => void refetch()}>Retry</button>
      </section>}
      {report && totals && <>
        <p className="pa-muted">Reporting {report.from} through {report.through} · {report.timezone}</p>
        {name === "teams" && <p className="pa-muted">Historical cases are grouped by current team membership.</p>}
        <div className="pa-metrics">
          <MetricCard title="Completed cases" value={amount(totals.completed)} note="Selected period" />
          <MetricCard title="Pending cases" value={amount(totals.pending)} note="Current shared backlog" />
          <MetricCard title="Weighted AHT" value={formatAht(totals.ahtSeconds)} note="Seconds per completed case" />
          <MetricCard title="Active moderators" value={amount(totals.activeModerators)} note="Online and moderating" />
          <MetricCard title="Active reservations" value={amount(totals.activeReservations)} note="Current valid leases" />
          <MetricCard title="Queue throughput" value={amount(chartRange?.completed ?? null)}
            note={chartRange ? "Latest hourly bucket · " + chartRange.label : "No elapsed reporting bucket"} />
        </div>
        <div className="pa-chart-grid"><ThroughputChart report={report} /><AuxChart report={report} /></div>
        {(name === "" || name === "organizations") && (report.teams.length > 0 || report.queues.length > 0) &&
          <div className="pa-chart-grid"><PerformanceComparison title="Team comparison" rows={report.teams}
              note="Completed cases grouped by current team membership" />
            <PerformanceComparison title="Queue comparison" rows={report.queues} /></div>}
        {name === "organizations" && <PerformanceComparison title="LOB comparison" rows={report.lobs ?? []} />}
        {name === "teams" && params.has("teamId") &&
          <PerformanceComparison title="Queue participation" rows={report.queues.filter((row) => row.completed > 0)} />}
        <div className="pa-chart-grid">
          <section className="wf-panel"><h2><Clock3 size={15} /> Handling duration</h2>
            <dl className="pa-mini-grid"><div><dt>Total handling</dt><dd>{seconds(totals.handlingSeconds)}</dd></div>
              {([["min", "Minimum"], ["median", "Median"], ["p75", "P75"], ["p90", "P90"], ["p95", "P95"], ["max", "Maximum"]] as const)
                .map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{seconds(report.handlingDistribution[key])}</dd></div>)}
            </dl></section>
          <section className="wf-panel"><h2><BarChart3 size={15} /> Operations detail</h2>
            <dl className="pa-mini-grid">
              <div><dt>Intake</dt><dd>{amount(totals.intake)}</dd></div>
              <div><dt>Net flow</dt><dd>{amount(totals.netFlow)}</dd></div>
              <div><dt>Released</dt><dd>{amount(totals.released)}</dd></div>
              <div><dt>Expired</dt><dd>{amount(totals.expired)}</dd></div>
              <div><dt>Cases / moderating hour</dt><dd>{amount(totals.casesPerHour)}</dd></div>
              <div><dt>Work sessions</dt><dd>{amount(totals.sessions)}</dd></div>
              <div><dt>Active employees</dt><dd>{amount(totals.activeEmployees)} / {amount(totals.employees)}</dd></div>
              <div><dt>Last completion</dt><dd>{localTime(totals.lastCompletedAt, report.timezone)}</dd></div>
            </dl><p className="pa-muted">Historical backlog trend unavailable. Current backlog reflects active queues.</p>
          </section>
        </div>
        <section className="wf-panel pa-performance">
          <div className="pa-section-heading"><h2>{sections[name][0]} details</h2><form onSubmit={(event) => {
            event.preventDefault();
            modify({ search: String(new FormData(event.currentTarget).get("search") ?? "").trim() });
          }}>
            <label className="sr-only" htmlFor="pa-search">Search performance rows</label>
            <input id="pa-search" name="search" key={params.get("search") ?? ""} defaultValue={params.get("search") ?? ""} placeholder="Search names" />
            <button type="submit">Search</button>
            <label>Sort <select value={params.get("order") ?? "completed"} onChange={(event) => modify({ order: event.target.value })}>
              <option value="completed">Most completed</option><option value="name">Name</option><option value="aht">Lowest AHT</option>
            </select></label>
          </form></div>
          <PerformanceTable rows={report.rows} dimension={dimension} timezone={report.timezone}
            open={name !== "my-performance" ? (row) => modify({ [filterForDimension]: row.id }) : undefined} />
          {report.totalRows > report.pageSize || report.page > 1 ? <div className="pa-paging">
            <button type="button" disabled={report.page <= 1 || isFetching} onClick={() => modify({ page: String(report.page - 1) })}>Previous</button>
            <span>Page {report.page} · {report.totalRows} records</span>
            <button type="button" disabled={report.page * report.pageSize >= report.totalRows || isFetching}
              onClick={() => modify({ page: String(report.page + 1) })}>Next</button>
          </div> : null}
        </section>
        <details className="wf-panel"><summary>Data quality</summary><dl className="pa-mini-grid">
          {Object.entries(report.quality).map(([key, value]) => <div key={key}>
            <dt>{key.replace(/[A-Z]/g, (letter) => " " + letter.toLowerCase())}</dt><dd>{amount(value)}</dd></div>)}
        </dl></details>
      </>}
    </>}
  </div>;
}
