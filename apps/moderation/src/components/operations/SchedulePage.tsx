import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { addDays, clock, dateTime, hours, localKey, names, number, percentage, showError, todayIn, useOps, useOpsAction,
  type Named, type Options } from "./operationsApi";

export type Filters = Record<string, string>;
type Update = (values: Record<string, string>) => void;
type Shift = Named & { organizationId: string; timezone: string; startLocal: string; endLocal: string; breakMinutes: number;
  lateGraceMinutes: number; earlyGraceMinutes: number; revision: number; active: boolean };
type Assignment = { id: string; employeeId: string; organizationId: string; teamId: string | null; shiftId: string | null;
  employee: Named; lob: Named; team: Named | null; shiftName: string; kind: string; startsAt: string; endsAt: string;
  localDate: string; timezone: string; status?: string; scheduledSeconds?: number; attendedSeconds?: number; late?: boolean; early?: boolean };
type Schedule = { rows: Assignment[]; count: number; page: number; limit: number; timezone: string; from: string; through: string };

export function Notice({ loading, error }: { loading?: boolean; error?: unknown }) {
  return <>{loading && <p role="status">Loading workforce data…</p>}{!!error && <p role="alert">{showError(error)}</p>}</>;
}
export function ActionNotice({ action }: { action: ReturnType<typeof useOpsAction> }) {
  return <>{action.error && <p role="alert">{action.error}</p>}{action.notice && <p role="status">{action.notice}</p>}</>;
}
export function Pagination({ count, page, limit, update }: { count: number; page: number; limit: number; update: Update }) {
  if (count <= limit && page === 1) return null;
  return <div className="ops-actions">
    <button disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Previous</button>
    <span>Page {page} · {count} records</span>
    <button disabled={page * limit >= count} onClick={() => update({ page: String(page + 1) })}>Next</button>
  </div>;
}
function DirectorySelect({ name, label, entries, value, required = false, placeholder }: {
  name: string; label: string; entries: Named[]; value?: string; required?: boolean; placeholder?: string;
}) {
  return <label>{label}<select name={name} required={required} defaultValue={value ?? ""}>
    <option value="">{placeholder ?? "Select " + label.toLowerCase()}</option>
    {entries.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>;
}
function ShiftEditor({ options, org, actor, resultPage }: { options: Options; org: string; actor: string; resultPage: string }) {
  const list = useOps<Shift[]>(actor, "/workforce/shifts", { organizationId: org || undefined }, Boolean(org));
  const [selected, setSelected] = useState("");
  const row = list.data?.find(({ id }) => id === selected);
  const action = useOpsAction();
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action.run("/workforce/shifts" + (row ? "/" + row.id : ""), {
      organizationId: org, name: form.get("name"), timezone: form.get("timezone"), startLocal: form.get("start"),
      endLocal: form.get("end"), breakMinutes: Number(form.get("break")), lateGraceMinutes: Number(form.get("late")),
      earlyGraceMinutes: Number(form.get("early")), active: form.get("active") === "on", revision: row?.revision,
    }, row ? "patch" : "post", row ? "Shift updated." : "Shift created.");
  }
  return <details className="wf-panel ops-stack" id="shift-editor">
    <summary>Shift editor</summary>
    <Notice loading={list.isPending} error={list.error} />
    <label>Shift definition<select value={selected} onChange={(event) => setSelected(event.target.value)}>
      <option value="">New shift</option>{list.data?.map((item) => <option key={item.id} value={item.id}>{item.name}{item.active ? "" : " (inactive)"}</option>)}</select></label>
    <form key={selected} className="ops-form" onSubmit={save}>
      <label>Shift name<input name="name" required minLength={2} maxLength={100} defaultValue={row?.name} /></label>
      <label>Shift timezone<input name="timezone" required defaultValue={row?.timezone ?? options.timezone} placeholder="Asia/Kolkata" /></label>
      <label>Local start<input name="start" type="time" required defaultValue={row?.startLocal ?? "09:00"} /></label>
      <label>Local end<input name="end" type="time" required defaultValue={row?.endLocal ?? "17:00"} /></label>
      <label>Break minutes<input name="break" type="number" min="0" max="720" required defaultValue={row?.breakMinutes ?? 30} /></label>
      <label>Late grace minutes<input name="late" type="number" min="0" max="120" required defaultValue={row?.lateGraceMinutes ?? 5} /></label>
      <label>Early departure grace minutes<input name="early" type="number" min="0" max="120" required defaultValue={row?.earlyGraceMinutes ?? 5} /></label>
      <label className="ops-choice"><input name="active" type="checkbox" defaultChecked={row?.active ?? true} />Available for new assignments</label>
      <button className="wf-primary" type="submit" disabled={action.busy || !org}>{row ? "Update shift" : "Create shift"}</button>
    </form>
    <p className="ops-muted">An end time earlier than the start time falls on the next local day. Existing assignments keep their original shift settings.</p>
    {!org && <p>Choose an organization for {resultPage}.</p>}
    <ActionNotice action={action} />
  </details>;
}

export function AssignmentForm({ options, org, date, replacement, clear }: {
  options: Options; org: string; date: string; replacement?: Assignment; clear: () => void;
}) {
  const [kind, setKind] = useState("SHIFT");
  const [recurrence, setRecurrence] = useState("once");
  const [weekdays, setWeekdays] = useState<number[]>([1,2,3,4,5]);
  const action = useOpsAction();
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await action.run("/workforce/assignments", {
      employeeId: form.get("employee"), teamId: form.get("team") || undefined, shiftId: kind === "SHIFT" ? form.get("shift") : undefined,
      from: form.get("from"), through: recurrence !== "once" && !replacement ? form.get("through") : undefined,
      weekdays: recurrence !== "once" && !replacement ? weekdays : undefined, alternating: recurrence === "alternating" && !replacement,
      replaceId: replacement?.id, kind, reason: form.get("reason"),
    }, "post", replacement ? "Schedule replaced." : "Schedule assigned.");
    if (result && replacement) clear();
  }
  return <details className="wf-panel ops-stack" open={replacement ? true : undefined}>
    <summary>{replacement ? "Replace assignment" : "Assign a shift or exception"}</summary>
    <form className="ops-form" key={replacement?.id ?? "new"} onSubmit={assign}>
      <DirectorySelect label="Employee" name="employee" entries={options.employees.filter(({ status }) => status === "ACTIVE")}
        value={replacement?.employeeId} required />
      <DirectorySelect label="Team" name="team" entries={options.teams} value={replacement?.teamId ?? undefined} placeholder="Use sole team membership" />
      <label>Assignment type<select value={kind} onChange={(event) => setKind(event.target.value)}>
        <option value="SHIFT">Shift</option><option value="OFF">Week off</option><option value="EXCUSED">Excused absence</option></select></label>
      {kind === "SHIFT" && <DirectorySelect label="Shift" name="shift" entries={options.shifts.filter(({ organizationId }) => !org || organizationId === org)}
        value={replacement?.shiftId ?? undefined} required />}
      <label>Start date<input name="from" type="date" required defaultValue={replacement?.localDate ?? date} readOnly={Boolean(replacement)} /></label>
      {!replacement && <label>Repeat<select value={recurrence} onChange={(event) => setRecurrence(event.target.value)}>
        <option value="once">Once</option><option value="weekly">Weekly</option><option value="alternating">Alternating weeks</option></select></label>}
      {!replacement && recurrence !== "once" && <>
        <label>Through date<input name="through" type="date" required defaultValue={addDays(date, 27)} /></label>
        <fieldset className="ops-days"><legend>Days of week</legend>{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((label, i) =>
          <label key={label} className="ops-choice"><input type="checkbox" value={i} checked={weekdays.includes(i)}
            onChange={(event) => setWeekdays(event.target.checked ? [...weekdays, i] : weekdays.filter((day) => day !== i))} />{label}</label>)}</fieldset>
      </>}
      <label>Schedule reason<input name="reason" minLength={3} maxLength={500} required /></label>
      <button className="wf-primary" type="submit" disabled={action.busy}>{replacement ? "Save replacement" : "Assign schedule"}</button>
      {replacement && <button type="button" onClick={clear}>Cancel replacement</button>}
    </form>
    <ActionNotice action={action} />
  </details>;
}

export function calendarRange(date: string, period: string) {
  if (period === "month") {
    const start = date.slice(0, 7) + "-01";
    const end = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).toISOString().slice(0,10);
    return { from: start, through: end };
  }
  if (period === "week") {
    const start = addDays(date, -((new Date(date).getUTCDay() + 6) % 7));
    return { from: start, through: addDays(start, 6) };
  }
  return { from: date, through: date };
}
function dateLabel(date: string) {
  return new Date(date + "T12:00:00Z").toLocaleDateString(undefined, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
}

export function SchedulePage({ actor, options, filters, view, anchor, update }: {
  actor: string; options: Options; filters: Filters; view: string; anchor?: string; update: Update;
}) {
  const [replacement, setReplacement] = useState<Assignment>();
  const timezone = options.timezone;
  const current = anchor || todayIn(timezone);
  const range = calendarRange(current, view);
  const result = useOps<Schedule>(actor, "/workforce/schedules", { ...filters, ...range });
  const action = useOpsAction();
  const org = filters.organizationId ?? options.organizations[0]?.id ?? "";
  const dayCount = Math.round((Date.parse(range.through) - Date.parse(range.from)) / 86400000) + 1;
  const records = result.data?.rows ?? [];
  function move(delta: number) {
    const next = view === "month" ? new Date(Date.UTC(Number(current.slice(0,4)), Number(current.slice(5,7)) - 1 + delta, 1)).toISOString().slice(0,10)
      : addDays(current, delta * (view === "week" ? 7 : 1));
    update({ anchor: next });
  }
  return <>
    <section className="wf-panel ops-stack" id="workforce-calendar">
      <div className="ops-title"><div><h2>Schedule calendar</h2><p className="ops-muted">{range.from} through {range.through} · {timezone}</p></div>
        <div className="ops-actions" aria-label="Calendar view">{["day","week","month"].map((item) =>
          <button key={item} aria-pressed={view === item} onClick={() => update({ view: item })}>{names(item)}</button>)}</div></div>
      <div className="ops-actions">
        <button onClick={() => move(-1)}>Previous {view}</button>
        <label>Calendar date<input type="date" value={current} onChange={(event) => event.target.value && update({ anchor: event.target.value })} /></label>
        <button onClick={() => move(1)}>Next {view}</button>
      </div>
      <Notice loading={result.isPending} error={result.error} />
      {result.data && <div className={"ops-calendar ops-calendar-" + view}>
        {Array.from({ length: dayCount }, (_, i) => addDays(range.from, i)).map((date) => {
          const items = records.filter((row) => localKey(new Date(row.startsAt), timezone) <= date &&
            localKey(new Date(+new Date(row.endsAt) - 1), timezone) >= date);
          return <section key={date} className="ops-day"><h3>{dateLabel(date)}</h3>{items.length ? items.map((row) =>
            <article key={row.id} className="ops-slot"><strong>{row.employee.name}</strong><span>{row.shiftName}</span>
              {row.kind === "SHIFT" && <small>{clock(row.startsAt, timezone)} → {clock(row.endsAt, timezone)}
                {row.localDate !== localKey(new Date(row.endsAt), row.timezone)
                  ? " · Overnight" : ""}</small>}
              <small>{names(row.status)}</small>
              {row.team && <small>{row.team.name}</small>}
              {options.canManage && Date.parse(row.startsAt) > Date.now() && <div className="ops-actions">
                <button onClick={() => setReplacement(row)}>Replace</button>
                <button disabled={action.busy} onClick={() => {
                  const reason = window.prompt("Reason for cancelling this future assignment");
                  if (reason && reason.trim().length >= 3) void action.run("/workforce/assignments/" + row.id, { reason }, "patch", "Assignment cancelled.");
                }}>Cancel shift</button>
              </div>}
            </article>) : <p className="ops-muted">No scheduled work</p>}</section>;
        })}
      </div>}
      <ActionNotice action={action} />
      {result.data && <Pagination page={result.data.page} count={result.data.count} limit={result.data.limit} update={update} />}
    </section>
    {options.canManage && <>
      <div className="ops-title"><h2><Plus size={16} /> Schedule changes</h2></div>
      <ShiftEditor key={org} org={org} options={options} actor={actor} resultPage="shift editing" />
      <AssignmentForm org={org} date={current} options={options} replacement={replacement} clear={() => setReplacement(undefined)} />
    </>}
  </>;
}

export function AttendancePage({ actor, filters, update }: { actor: string; filters: Filters; update: Update }) {
  const report = useOps<{ count: number; rows: Assignment[]; scheduled: number; attended: number; missed: number; late: number; early: number; excused: number;
    adherence: number | null; scheduledSeconds: number; attendedSeconds: number; timezone: string; available: boolean }>(actor, "/workforce/attendance-adherence", filters);
  const data = report.data;
  return <section className="wf-panel ops-stack">
    <h2>Attendance adherence</h2>
    <p className="ops-muted">Recorded attendance within planned shifts. An empty current shift is reviewed after the attendance window and grace period.</p>
    <Notice loading={report.isPending} error={report.error} />
    {data && <>{!data.available && <p role="alert">This range exceeds the reporting limit. Narrow the filters for complete results.</p>}
      <div className="ops-kpis">{[
        ["Scheduled", number(data.scheduled)], ["Attended", number(data.attended)], ["Missed", number(data.missed)],
        ["Late", number(data.late)], ["Early departures", number(data.early)], ["Excused", number(data.excused)],
        ["Adherence", data.available ? percentage(data.adherence) : "Unavailable"], ["Recorded attendance", hours(data.attendedSeconds)],
      ].map(([label, value]) => <dl key={label}><dt>{label}</dt><dd>{value}</dd></dl>)}</div>
      {data.rows.length ? <div className="ops-table"><table><thead><tr><th>Employee</th><th>Shift</th><th>Starts</th><th>Status</th><th>Elapsed attendance</th></tr></thead>
        <tbody>{data.rows.map((row) => <tr key={row.id}><th scope="row">{row.employee.name}</th><td>{row.shiftName}</td>
          <td>{dateTime(row.startsAt, data.timezone)}</td><td>{names(row.status)}{row.late && row.status !== "LATE" ? " · Late start" : ""}{row.early ? " · Early departure" : ""}</td>
          <td>{hours(row.attendedSeconds)} / {hours(row.scheduledSeconds)}</td></tr>)}</tbody></table></div> : <p>No schedule entries match.</p>}
      <Pagination page={Number(filters.page ?? 1)} limit={60} count={data.count} update={update} />
    </>}
  </section>;
}
