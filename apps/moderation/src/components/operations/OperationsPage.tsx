import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useData, type Actor } from "../../api";
import { AttendancePage, SchedulePage, Notice, ActionNotice, Pagination, calendarRange, type Filters } from "./SchedulePage";
import { ExecutivePage, LivePage, PlanningPage } from "./PlanningPages";
import { dateTime, names, todayIn, useOps, useOpsAction, useOpsFilters, type Named, type Options } from "./operationsApi";
import "./operations.css";

const pages = [
  ["schedule", "Workforce schedule"], ["attendance", "Attendance adherence"], ["live", "Live workforce"],
  ["capacity", "Capacity planning"], ["forecast", "Queue demand forecast"], ["gaps", "Staffing gap"],
  ["overview", "Executive overview"], ["teams", "Team performance"], ["organizations", "Organization comparison"],
  ["alerts", "Operational alerts"],
] as const;
const management = new Set(["capacity","forecast","gaps","overview","teams","organizations","alerts"]);
type Rule = { id: string; organizationId: string; queueId: string | null; metric: string; severity: string; enabled: boolean;
  threshold: number; intervalSeconds: number; cooldownSeconds: number; revision: number };
type Event = { id: string; observed: number; threshold: number; severity: string; triggeredAt: string; acknowledgedAt: string | null;
  resolvedAt: string | null; rule: Rule & { queue: Named | null; organization: Named } };
function AlertsPage({ actor, options, filters, update }: { actor: string; options: Options; filters: Filters; update: (values: Filters) => void }) {
  const query = useOps<{ rules: Rule[]; rows: Event[]; page: number; count: number }>(actor, "/workforce/alerts",
    { organizationId: filters.organizationId, page: filters.page }, true, 20000);
  const action = useOpsAction();
  const [id, setId] = useState("");
  const rule = query.data?.rules.find((item) => item.id === id);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action.run("/workforce/alerts/rules" + (rule ? "/" + rule.id : ""), {
      organizationId: form.get("organizationId"), queueId: form.get("queueId") || undefined, metric: form.get("metric"),
      severity: form.get("severity"), threshold: Number(form.get("threshold")), intervalSeconds: Number(form.get("interval")),
      cooldownSeconds: Number(form.get("cooldown")), enabled: form.get("enabled") === "on", revision: rule?.revision,
    }, rule ? "patch" : "post", rule ? "Alert rule updated." : "Alert rule created.");
  }
  return <div className="ops-stack">
    <section className="wf-panel ops-stack" id="operational-alerts">
      <h2>Operational alerts</h2><p className="ops-muted">Rules evaluate persisted records. Acknowledgment records ownership and resolution follows recovery.</p>
      <Notice loading={query.isPending} error={query.error} />
      {query.data && (!query.data.rows.length ? <p>No alert events in this scope.</p> : <div className="ops-table"><table>
        <thead><tr><th>Alert</th><th>Scope</th><th>Observed / threshold</th><th>Triggered</th><th>State</th><th>Action</th></tr></thead>
        <tbody>{query.data.rows.map((event) => <tr key={event.id}><th scope="row">{names(event.rule.metric)}<small>{names(event.severity)}</small></th>
          <td>{event.rule.queue?.name ?? event.rule.organization.name}</td><td>{event.observed} / {event.threshold}</td>
          <td>{dateTime(event.triggeredAt, options.timezone)}</td><td>{event.resolvedAt ? "Resolved" : event.acknowledgedAt ? "Acknowledged" : "Open"}</td>
          <td>{!event.acknowledgedAt && !event.resolvedAt && <button disabled={action.busy}
            onClick={() => void action.run("/workforce/alerts/" + event.id + "/acknowledge", {}, "post", "Alert acknowledged.")}>Acknowledge alert</button>}</td></tr>)}</tbody></table></div>)}
      {query.data && <Pagination count={query.data.count} page={query.data.page} limit={40} update={update}/>}
    </section>
    <section className="wf-panel ops-stack"><h2>Alert rules</h2>
      <label>Configured rule<select value={id} onChange={(event) => setId(event.target.value)}><option value="">New rule</option>
        {query.data?.rules.map((item) => <option key={item.id} value={item.id}>{names(item.metric)} · {names(item.severity)}</option>)}</select></label>
      <form className="ops-form" onSubmit={submit} key={rule?.id ?? "new"}>
        <label>Rule organization<select name="organizationId" required defaultValue={rule?.organizationId ?? filters.organizationId ?? (options.organizations.length === 1 ? options.organizations[0]?.id : "")}>
          <option value="">Select organization</option>{options.organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
        <label>Queue scope<select name="queueId" defaultValue={rule?.queueId ?? ""}><option value="">Organization wide</option>
          {options.queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}</select></label>
        <label>Alert metric<select name="metric" defaultValue={rule?.metric ?? "QUEUE_BACKLOG"}>
          {["QUEUE_BACKLOG","STALE_ATTENDANCE","QA_BACKLOG","STAFFING_SHORTFALL"].map((metric) => <option key={metric} value={metric}>{names(metric)}</option>)}</select></label>
        <label>Threshold<input name="threshold" required type="number" min="1" max="1000000" defaultValue={rule?.threshold ?? 10}/></label>
        <label>Severity<select name="severity" defaultValue={rule?.severity ?? "WARNING"}>
          {["INFO","WARNING","CRITICAL"].map((severity) => <option key={severity} value={severity}>{names(severity)}</option>)}</select></label>
        <label>Evaluation interval (seconds)<input name="interval" required type="number" min="30" max="86400" defaultValue={rule?.intervalSeconds ?? 60}/></label>
        <label>Cooldown (seconds)<input name="cooldown" required type="number" min="0" max="604800" defaultValue={rule?.cooldownSeconds ?? 300}/></label>
        <label className="ops-choice"><input type="checkbox" name="enabled" defaultChecked={rule?.enabled ?? true}/>Enabled</label>
        <button type="submit" className="wf-primary" disabled={action.busy}>{rule ? "Update alert rule" : "Create alert rule"}</button>
      </form>
      <ActionNotice action={action}/>
    </section>
  </div>;
}
function ExportControl({ mode, params }: { mode: string; params: Filters }) {
  const action = useOpsAction();
  const initial = mode === "schedule" ? "schedule" : mode === "attendance" ? "attendance" : mode === "teams" ? "team" : "executive";
  const [report, setReport] = useState(initial);
  return <div className="ops-stack">
    <div className="ops-actions"><label>Report<select value={report} onChange={(event) => setReport(event.target.value)}>
      {[["schedule","Schedule"],["attendance","Attendance"],["aux","AUX utilization"],["team","Team performance"],["queue","Queue performance"],
        ["qa","QA accuracy"],["executive","Executive summary"]].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <button type="button" disabled={action.busy} onClick={() => void action.download(report, params)}>Export CSV</button></div>
    <ActionNotice action={action}/>
  </div>;
}
export function OperationsPage() {
  const { data: actor } = useData<Actor>("/session");
  const { view = "schedule" } = useParams();
  const { params, search, update } = useOpsFilters();
  const options = useOps<Options>(actor?.userId ?? "", "/workforce/operations/options", {
    organizationId: params.organizationId, timezone: params.timezone,
  }, Boolean(actor));
  if (!actor || options.isPending) return <p role="status">Checking workforce access…</p>;
  if (!options.data) return <Notice error={options.error}/>;
  const scope = options.data;
  const permitted = (candidate: string) => (!management.has(candidate) || scope.canManage)
    && (candidate !== "organizations" || Boolean(actor.superAdmin)) && (candidate !== "alerts" || scope.canAdmin);
  const title = pages.find(([key]) => key === view)?.[1];
  const anchor = search.get("anchor") || todayIn(scope.timezone);
  const calendarView = search.get("view");
  const filters = params;
  const planning = ["capacity","forecast","gaps"].includes(view);
  const timeFilters = view !== "schedule" && view !== "alerts" && view !== "live";
  const assumptions = Object.fromEntries(["utilizationPercent","fallbackAhtSeconds"].flatMap((key) =>
    search.get(key) ? [[key, search.get(key)!]] : []));
  const directory: [string, string, Named[]][] = [
    ["organizationId","Organization", scope.organizations], ["lobId","Line of business", scope.lobs],
    ["teamId","Team", scope.teams], ["employeeId","Employee", scope.employees], ["managerId","Team manager", scope.employees],
    ["shiftId","Shift definition", scope.shifts], ["queueId","Queue", scope.queues],
  ];
  const queryForExport = view === "schedule" ? { ...filters, ...calendarRange(anchor, calendarView ?? "day") } : view === "teams" && !filters.teamId && scope.teams[0]
    ? { ...filters, teamId: scope.teams[0].id } : filters;
  return <div className="ops-ui ops-stack">
    <div className="ops-title"><div><h1>{title ?? "Workforce operations"}</h1><p className="ops-muted">Reporting timezone · {scope.timezone}</p></div></div>
    <nav className="ops-actions" aria-label="Workforce operations views">{pages.filter(([key]) => permitted(key)).map(([key,label]) =>
      <Link key={key} to={"/operations/" + key + (params.organizationId ? "?organizationId=" + params.organizationId : "")}
        aria-current={view === key ? "page" : undefined}>{label}</Link>)}</nav>
    {!permitted(view) || !title ? <p role="alert">This workforce view is outside your access.</p> : <>
      <section className="wf-panel ops-form" aria-label="Workforce filters">
        {directory.filter(([id, , items]) => items.length > 0 && (view !== "alerts" || id === "organizationId") &&
          (scope.canManage || !["managerId","teamId","queueId"].includes(id)) &&
          (!["overview","organizations","teams"].includes(view) || id !== "shiftId") &&
          (!["schedule","attendance","live"].includes(view) || id !== "queueId") &&
          (view !== "teams" || id !== "teamId")).map(([key,label,items]) =>
          <label key={key}>{label}<select value={filters[key] ?? ""} onChange={(event) => update({ [key]: event.target.value })}>
            <option value="">All in scope</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}
        {timeFilters && <><label>From<input type="date" value={filters.from ?? (planning ? todayIn(scope.timezone, 1) : "")}
          onChange={(event) => update({ from: event.target.value })}/></label>
          <label>Through<input type="date" value={filters.through ?? (planning ? filters.from ?? todayIn(scope.timezone,1) : "")}
            onChange={(event) => update({ through: event.target.value })}/></label></>}
        {view !== "alerts" && <label>Reporting timezone<input key={scope.timezone} defaultValue={scope.timezone} onBlur={(event) => {
          const value = event.target.value.trim();
          try { if (value) new Intl.DateTimeFormat("en", { timeZone: value }); }
          catch { event.target.setCustomValidity("Enter a valid IANA timezone, such as Asia/Kolkata."); event.target.reportValidity(); return; }
          event.target.setCustomValidity("");
          if (value !== scope.timezone) update({ timezone: value });
        }} onChange={(event) => event.target.setCustomValidity("")} /></label>}
        {view === "attendance" && <label>Attendance status<select value={filters.attendance ?? ""} onChange={(event) => update({ attendance: event.target.value })}>
          <option value="">Any status</option>{["NOT_STARTED","PRESENT","LATE","COMPLETED","ABSENT","EXCUSED","UNKNOWN","OFF"].map((value) =>
            <option key={value} value={value}>{names(value)}</option>)}</select></label>}
        {view === "live" && <label>AUX state<select value={filters.aux ?? ""} onChange={(event) => update({ aux: event.target.value })}>
          <option value="">Any state</option>{["MODERATING","NON_MODERATING","BREAK","MEETING","OFFLINE","TRAINING"].map((value) =>
            <option key={value} value={value}>{names(value)}</option>)}</select></label>}
      </section>
      <ExportControl key={view} mode={view} params={queryForExport}/>
      {view === "schedule" && <SchedulePage actor={actor.userId} options={scope} filters={filters} anchor={anchor}
        view={calendarView === "month" || calendarView === "week" ? calendarView : "day"} update={update}/>}
      {view === "attendance" && <AttendancePage actor={actor.userId} filters={filters} update={update}/>}
      {view === "live" && <LivePage actor={actor.userId} filters={filters} update={update}/>}
      {planning && <PlanningPage actor={actor.userId} options={scope} filters={filters} mode={view} update={update} assumptions={assumptions}/>}
      {["overview","teams","organizations"].includes(view) && <ExecutivePage actor={actor.userId} options={scope} filters={filters} mode={view} update={update}/>}
      {view === "alerts" && <AlertsPage actor={actor.userId} options={scope} filters={filters} update={update}/>}
    </>}
  </div>;
}
