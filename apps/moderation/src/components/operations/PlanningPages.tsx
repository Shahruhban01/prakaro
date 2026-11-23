import { useState, type FormEvent } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dateTime, hours, names, number, percentage, seconds, todayIn, useOps, useOpsAction, type Named, type Options } from "./operationsApi";
import { ActionNotice, Notice, Pagination, type Filters } from "./SchedulePage";

type Update = (values: Record<string, string>) => void;
type Live = { generatedAt: string; timezone: string; count: number; attending: number; moderating: number; scheduledNow: number;
  rows: { id: string; name: string; role: string; status: string; lob: string | null; teams: string[]; shift: { shiftName: string } | null;
    presence: string; attendance: string; aux: string | null; heartbeat: string | null; queue: string | null; reservationId: string | null;
    auxSeconds: number | null; subscriptions: string[] }[] };
type Plan = { organizationId?: string; utilizationPercent: number; trainingMeetingMinutes: number;
  fallbackAhtSeconds: number | null; queueWeights: Record<string, number>; revision: number };
type CapacityRow = Named & { organizationId: string | null; availableSeconds: number; ahtSeconds: number | null;
  ahtSource: string; historicalCompleted: number; estimate: number | null; expected: number | null; pending: number | null;
  netBacklogChange: number | null; additionalModeratingHours: number | null; risk: string };
type ForecastRow = Named & { observations: number; horizonDays: number; expected: number | null;
  values: { date: string; samples: number; expected: number | null; low: number | null; high: number | null }[] };
type Forecast = { generatedAt: string; throughHistory: string; method: string; queues: ForecastRow[] };
type Capacity = { generatedAt: string; assumptions: Plan | null; rows: CapacityRow[]; demand: Forecast;
  scheduledEmployees: number; from: string; through: string; timezone: string };

export function Kpis({ rows }: { rows: [string, string | number][] }) {
  return <div className="ops-kpis">{rows.map(([title, value]) =>
    <dl key={title}><dt>{title}</dt><dd>{value}</dd></dl>)}</div>;
}
export function LivePage({ actor, filters, update }: { actor: string; filters: Filters; update: Update }) {
  const query = useOps<Live>(actor, "/workforce/live", filters, true, 20000);
  return <section className="wf-panel ops-stack" id="live-workforce">
    <h2>Live workforce</h2><p className="ops-muted">Presence and attendance are separate. A disconnected heartbeat can still have an open attendance session.</p>
    <Notice loading={query.isPending} error={query.error} />
    {query.data && <><p className="ops-muted">Updated {dateTime(query.data.generatedAt, query.data.timezone)}</p>
      <Kpis rows={[["Scheduled now", query.data.scheduledNow], ["Attending", query.data.attending], ["Moderating online", query.data.moderating]]} />
      {query.data.rows.length ? <div className="ops-table"><table><thead><tr><th>Employee</th><th>Team / LOB</th><th>Planned shift</th><th>Attendance</th>
        <th>AUX / elapsed</th><th>Presence</th><th>Queue / case</th><th>Last heartbeat</th></tr></thead>
        <tbody>{query.data.rows.map((row) => <tr key={row.id}><th scope="row">{row.name}<small>{names(row.role)} · {names(row.status)}</small>
          <small>{row.subscriptions.length ? "Subscribed · " + row.subscriptions.join(", ") : "No queue subscriptions in scope"}</small></th>
          <td>{row.teams.join(", ") || "Unassigned"}<small>{row.lob ?? "Unavailable"}</small></td>
          <td>{row.shift?.shiftName ?? "No shift now"}</td><td>{names(row.attendance)}</td><td>{names(row.aux)}<small>{seconds(row.auxSeconds)}</small></td>
          <td>{names(row.presence)}</td><td>{row.queue ?? "No active queue"}{row.reservationId && <small>Case reserved</small>}</td>
          <td>{dateTime(row.heartbeat, query.data!.timezone)}</td></tr>)}</tbody></table></div> : <p>No staff match these filters.</p>}
      <Pagination page={Number(filters.page ?? 1)} count={query.data.count} limit={50} update={update} />
    </>}
  </section>;
}
function PlanEditor({ plan, options, org }: { plan: Plan; options: Options; org: string }) {
  const action = useOpsAction();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const weights = Object.fromEntries(options.queues.flatMap(({ id }) => {
      const value = form.get("queue-" + id);
      return typeof value === "string" && value.length ? [[id, Number(value)]] : [];
    }));
    await action.run("/workforce/capacity", {
      organizationId: org, revision: plan.revision, utilizationPercent: Number(form.get("utilization")),
      trainingMeetingMinutes: Number(form.get("training")), fallbackAhtSeconds: form.get("aht") ? Number(form.get("aht")) : null,
      timezone: form.get("timezone"), queueWeights: weights,
    }, "put", "Capacity assumptions saved.");
  }
  return <details className="wf-panel ops-stack"><summary>Organization capacity assumptions</summary>
    <form className="ops-form" onSubmit={submit}>
      <label>Expected moderating utilization (%)<input name="utilization" required min="0" max="100" type="number" defaultValue={plan.utilizationPercent} /></label>
      <label>Meeting and training minutes per shift<input name="training" min="0" max="480" type="number" required defaultValue={plan.trainingMeetingMinutes} /></label>
      <label>Fallback AHT (seconds)<input name="aht" min="1" max="3600" type="number" defaultValue={plan.fallbackAhtSeconds ?? ""} /></label>
      <label>Organization reporting timezone<input name="timezone" required defaultValue={options.timezone} /></label>
      {options.queues.slice(0,100).map((queue) => <label key={queue.id}>Allocation weight · {queue.name}<input type="number" min="0" max="100"
        name={"queue-" + queue.id} defaultValue={plan.queueWeights[queue.id] ?? ""} placeholder="Default 1" /></label>)}
      <button className="wf-primary" type="submit" disabled={action.busy}>Save assumptions</button>
    </form><ActionNotice action={action} />
  </details>;
}
export function CapacityTable({ rows }: { rows: CapacityRow[] }) {
  if (!rows.length) return <p>No eligible queues in scope.</p>;
  return <div className="ops-table"><table><thead><tr><th>Queue</th><th>Allocated hours</th><th>Weighted AHT</th><th>Theoretical capacity</th>
    <th>Expected intake</th><th>Pending now</th><th>Net backlog change</th><th>Additional moderating hours</th><th>Coverage</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id}><th scope="row">{row.name}</th><td>{hours(row.availableSeconds)}</td>
      <td>{seconds(row.ahtSeconds)}<small>{names(row.ahtSource)} · {row.historicalCompleted} completions</small></td>
      <td>{number(row.estimate, 0)}</td><td>{number(row.expected)}</td><td>{number(row.pending, 0)}</td>
      <td>{number(row.netBacklogChange)}</td><td>{number(row.additionalModeratingHours)}{row.additionalModeratingHours !== null ? " h" : ""}</td>
      <td>{names(row.risk)}</td></tr>)}</tbody></table></div>;
}
export function PlanningPage({ actor, options, filters, update, mode, assumptions }: {
  actor: string; options: Options; filters: Filters; update: Update; mode: string; assumptions: Record<string, string>;
}) {
  const tomorrow = todayIn(options.timezone, 1);
  const query = { ...filters, from: filters.from ?? tomorrow, through: filters.through ?? filters.from ?? tomorrow };
  const ask = useOps<Capacity>(actor, "/workforce/capacity", { ...query, ...assumptions }, mode !== "forecast");
  const outlook = useOps<Forecast>(actor, "/workforce/forecast", query, mode === "forecast");
  const [chosen, setChosen] = useState("");
  const data = ask.data;
  const org = filters.organizationId ?? (options.organizations.length === 1 ? options.organizations[0]?.id : undefined);
  if (mode === "forecast") {
    const queue = outlook.data?.queues.find(({ id }) => id === chosen) ?? outlook.data?.queues[0];
    return <section id="queue-forecast" className="wf-panel ops-stack">
      <h2>Queue demand forecast</h2>
      <Notice loading={outlook.isPending} error={outlook.error} />
      {outlook.data && <><p>{outlook.data.method}</p><p className="ops-muted">Data through {outlook.data.throughHistory} · Forecast generated {dateTime(outlook.data.generatedAt, options.timezone)}</p>
        {outlook.data.queues.length > 0 && <label>Forecast queue<select value={queue?.id ?? ""} onChange={(event) => setChosen(event.target.value)}>
          {outlook.data.queues.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {queue && <Kpis rows={[["Historical sample days", queue.observations], ["Forecast horizon (days)", queue.horizonDays], ["Expected intake", number(queue.expected)]]} />}
        {!queue || queue.expected === null ? <p>Insufficient historical data.</p> : <>
          <div className="ops-chart" aria-hidden="true"><ResponsiveContainer><LineChart data={queue.values}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date"/><YAxis allowDecimals={false}/><Tooltip/>
            <Line type="linear" dataKey="expected" stroke="#315eaf" isAnimationActive={false} />
          </LineChart></ResponsiveContainer></div>
          <div className="ops-table"><table><thead><tr><th>Day</th><th>Expected</th><th>Observed range</th><th>Matching weekdays</th></tr></thead>
            <tbody>{queue.values.map((point) => <tr key={point.date}><th scope="row">{point.date}</th><td>{number(point.expected)}</td>
              <td>{point.low === null ? "Unavailable" : point.low + "–" + point.high}</td><td>{point.samples}</td></tr>)}</tbody></table></div></>}
      </>}
    </section>;
  }
  return <>
    <section className="wf-panel ops-stack" id="capacity-planning">
      <h2>{mode === "gaps" ? "Staffing gap analysis" : "Capacity planning"}</h2>
      <p>Theoretical estimates use scheduled eligible time and weighted AHT. Available seconds are shared across subscribed queues using allocation weights.</p>
      <form className="ops-actions" onSubmit={(event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        update({ utilizationPercent: String(form.get("utilization") ?? ""), fallbackAhtSeconds: String(form.get("aht") ?? "") });
      }}>
        <label>Scenario utilization (%)<input key={"utilization-" + (assumptions.utilizationPercent ?? "")} type="number" name="utilization" min="0" max="100"
          defaultValue={assumptions.utilizationPercent ?? ""} placeholder="Use organization setting" /></label>
        <label>Scenario fallback AHT (seconds)<input key={"aht-" + (assumptions.fallbackAhtSeconds ?? "")} type="number" name="aht" min="1" max="3600"
          defaultValue={assumptions.fallbackAhtSeconds ?? ""} placeholder="Unavailable if no history" /></label>
        <button type="submit" className="wf-primary">Apply scenario</button>
      </form>
      <Notice loading={ask.isPending} error={ask.error}/>
      {data && <><p className="ops-muted">{data.from} through {data.through} · {data.timezone} · {data.scheduledEmployees} eligible scheduled staff.
        {" "}Utilization {assumptions.utilizationPercent ?? data.assumptions?.utilizationPercent ?? "per organization"}%.
        {" "}Meetings/training {data.assumptions?.trainingMeetingMinutes ?? "per organization"} minutes per shift.</p>
        {data.rows.some((row) => row.expected === null) && <p className="ops-muted">Insufficient historical data or a partial day prevents some demand estimates.</p>}
        <CapacityTable rows={data.rows}/></>}
    </section>
    {data?.assumptions && options.canAdmin && org && <PlanEditor key={org + ":" + data.assumptions.revision} plan={data.assumptions}
      options={options} org={org} />}
  </>;
}
type Quality = { evaluated: number; passes: number; accuracy: number | null };
type Executive = { generatedAt: string; timezone: string; from: string; through: string; attribution: string;
  employees: number; scheduledEmployees: number; scheduledNow: number; attending: number; moderating: number;
  completed: number; ahtSeconds: number | null; pending: number | null; quality: Quality; sampled: number | null; eligible: number | null;
  coverage: number | null; aux: Record<string, number> | null; auxUtilization: number | null; casesPerModeratingHour: number | null;
  adherence: number | null; openAlerts: number | null; forecastDate: string; capacity: CapacityRow[]; teams: (Named & { roster: number })[];
  trend: ({ date: string } & Quality)[]; queues: { id: string; name: string; completed: number; ahtSeconds: number | null; pending: number | null }[];
  organizations: (Named & { completed: number; ahtSeconds: number | null; pending: number | null; quality: Quality; risks: number; auxUtilization: number | null })[];
  teamRoster: { name: string; role: string; lob: string | null; attendance: string; aux: string | null }[];
};
export function ExecutivePage({ actor, options, filters, update, mode }: {
  actor: string; options: Options; filters: Filters; update: Update; mode: string;
}) {
  const team = filters.teamId || (mode === "teams" ? options.teams[0]?.id : undefined);
  const report = useOps<Executive>(actor, "/moderation/executive/" + mode,
    { ...filters, teamId: team }, mode !== "teams" || Boolean(team), 30000);
  const data = report.data;
  return <div className="ops-stack">
    {mode === "teams" && <section className="wf-panel"><label>Performance team<select value={team ?? ""} onChange={(event) => update({ teamId: event.target.value })}>
      <option value="">Choose team</option>{options.teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></section>}
    {mode === "teams" && !team ? <p>No authorized teams to compare.</p> : <Notice loading={report.isPending} error={report.error}/>}
    {data && <>
      <section className="wf-panel ops-stack" id="executive-overview">
        <div className="ops-title"><h2>{mode === "organizations" ? "Organization comparison" : mode === "teams" ? "Team performance" : "Executive overview"}</h2>
          <span className="ops-muted">Updated {dateTime(data.generatedAt, data.timezone)}</span></div>
        <p>{data.from} through {data.through} · {data.timezone}{mode === "teams" && " · Work within recorded team schedules"}</p>
        <Kpis rows={[
          ["Employees", data.employees], ["Scheduled staff", data.scheduledEmployees], ["Currently attending", data.attending], ["Currently moderating", data.moderating],
          ["Completed cases", data.completed], ["Pending backlog", number(data.pending, 0)], ["Weighted AHT", seconds(data.ahtSeconds)],
          ["QA accuracy", percentage(data.quality.accuracy) + " · " + data.quality.evaluated + " reviews"],
          ["Sampling coverage", percentage(data.coverage) + (data.eligible === null ? "" : " · " + (data.sampled ?? 0) + "/" + data.eligible)],
          ["AUX utilization", percentage(data.auxUtilization)], ["Moderating hours", hours(data.aux?.MODERATING)],
          ["Cases per moderating hour", number(data.casesPerModeratingHour)], ["Schedule adherence", percentage(data.adherence)],
          ["Open operational alerts", number(data.openAlerts, 0)],
        ]}/>
      </section>
      {mode === "teams" && <section className="wf-panel ops-stack"><h2>Current team roster</h2>
        {data.teamRoster.length ? <div className="ops-table"><table><thead><tr><th>Employee</th><th>LOB</th><th>Attendance</th><th>AUX</th></tr></thead>
          <tbody>{data.teamRoster.map((row, index) => <tr key={index}><th scope="row">{row.name}<small>{names(row.role)}</small></th>
            <td>{row.lob ?? "Unavailable"}</td><td>{names(row.attendance)}</td><td>{names(row.aux)}</td></tr>)}</tbody></table></div> : <p>No roster entries.</p>}</section>}
      {mode === "organizations" && <section className="wf-panel ops-stack"><h2>Organization metrics</h2>
        {data.organizations.length ? <div className="ops-table"><table><thead><tr><th>Organization</th><th>Completed</th><th>Weighted AHT</th>
          <th>Pending</th><th>QA accuracy / sample</th><th>AUX utilization</th><th>Coverage gaps</th></tr></thead><tbody>{data.organizations.map((row) =>
            <tr key={row.id}><th scope="row">{row.name}</th><td>{row.completed}</td><td>{seconds(row.ahtSeconds)}</td><td>{number(row.pending)}</td>
              <td>{percentage(row.quality.accuracy)} · {row.quality.evaluated}</td><td>{percentage(row.auxUtilization)}</td><td>{row.risks}</td></tr>)}</tbody></table></div>
          : <p>No organizations in scope.</p>}</section>}
      {!!data.aux && <section className="wf-panel ops-stack"><h2>AUX utilization</h2>
        <div className="ops-chart" aria-hidden="true"><ResponsiveContainer><BarChart data={Object.entries(data.aux).map(([label, value]) =>
          ({ label: names(label), hours: value / 3600 }))}><XAxis dataKey="label"/><YAxis/><Tooltip/><Bar dataKey="hours" fill="#315eaf" isAnimationActive={false}/>
        </BarChart></ResponsiveContainer></div>
        <ul className="ops-actions">{Object.entries(data.aux).map(([label, value]) => <li key={label}>{names(label)} · {hours(value)}</li>)}</ul></section>}
      <section className="wf-panel ops-stack"><h2>Queue throughput</h2>
        {data.queues.length ? <div className="ops-table"><table><thead><tr><th>Queue</th><th>Completed</th><th>Weighted AHT</th><th>Pending now</th></tr></thead>
          <tbody>{data.queues.map((row) => <tr key={row.id}><th scope="row">{row.name}</th><td>{row.completed}</td><td>{seconds(row.ahtSeconds)}</td>
            <td>{number(row.pending)}</td></tr>)}</tbody></table></div> : <p>No completed work in this range.</p>}</section>
      <section className="wf-panel ops-stack"><h2>Finalized QA trend (UTC)</h2>
        {data.trend.length ? <ul>{data.trend.map((point) => <li key={point.date}>{point.date} · {percentage(point.accuracy)} · {point.evaluated} evaluations</li>)}</ul>
          : <p>No finalized QA evaluations in this range.</p>}</section>
      <section className="wf-panel ops-stack"><h2>Theoretical staffing capacity · {data.forecastDate}</h2><CapacityTable rows={data.capacity}/></section>
    </>}
  </div>;
}
