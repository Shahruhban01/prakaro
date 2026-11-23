import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatAht } from "../GlobalAuxControl";

export type MetricRow = {
  id: string; name: string; detail: string | null; organization: string | null;
  completed: number; handlingSeconds: number; ahtSeconds: number | null;
  pending: number | null; intake: number | null; released: number | null; expired: number | null;
  sessions: number | null; casesPerHour: number | null; moderatingSeconds: number | null;
  activeModerators: number | null; activeReservations: number | null;
  presence: string | null; attendance: string | null; aux: string | null;
  currentQueue: string | null; lastSeen: string | null; lastCompletedAt: string | null;
};

type Point = { label: string; start: string; completed: number; ahtSeconds: number | null };
type Option = { id: string; name: string };
export type Report = {
  generatedAt: string; timezone: string; from: string; through: string;
  totals: {
    completed: number; pending: number | null; ahtSeconds: number | null; handlingSeconds: number;
    activeModerators: number; activeReservations: number; casesPerHour: number | null;
    intake: number | null; netFlow: number | null; sessions: number; released: number; expired: number;
    employees: number; activeEmployees: number; lastCompletedAt: string | null;
  };
  aux: { states: Record<string, number>; eligibleSeconds: number; utilization: number | null } | null;
  handlingDistribution: { count: number; min: number | null; max: number | null; median: number | null;
    p75: number | null; p90: number | null; p95: number | null; mean: number | null };
  quality: Record<string, number | null>;
  hourly: Point[]; daily: Point[]; backlogTrend: null;
  rows: MetricRow[]; teams: MetricRow[]; queues: MetricRow[]; lobs: MetricRow[];
  page: number; pageSize: number; totalRows: number;
  options: Record<"organizations" | "lobs" | "teams" | "queues" | "moderators", Option[]>;
};

export const amount = (value: number | null) => value === null ? "Unavailable" : value.toLocaleString();
export const seconds = (value: number | null) => value === null ? "Unavailable" :
  value.toLocaleString(undefined, { maximumFractionDigits: 1 }) + "s";
export const readable = (value: string | null) => value ? value.toLowerCase().replaceAll("_", " ")
  .replace(/^./, (letter) => letter.toUpperCase()) : "Unavailable";
export const localTime = (date: string | null, timezone: string) =>
  date ? new Date(date).toLocaleTimeString(undefined, { timeZone: timezone, hour12: false }) : "Unavailable";

export function MetricCard({ title, value, note }: { title: string; value: string; note?: string }) {
  return <dl className="wf-panel pa-metric"><dt>{title}</dt><dd>{value}</dd>{note && <dd className="pa-muted">{note}</dd>}</dl>;
}

export function DataFreshness({ report, failed }: { report: Report; failed: boolean }) {
  return <p className={failed ? "pa-stale" : "pa-muted"} role={failed ? "status" : undefined}>
    {failed ? "Update failed. Showing data from " : "Updated "}{localTime(report.generatedAt, report.timezone)}
    {" · "}{report.timezone}
  </p>;
}

export function ThroughputChart({ report }: { report: Report }) {
  const [mode, setMode] = useState<"daily" | "hourly" | "duration">("daily");
  const rows = mode === "hourly" ? report.hourly : report.daily;
  const duration = mode === "duration";
  return <section className="wf-panel pa-chart-panel" aria-label="Throughput trends">
    <div className="pa-section-heading"><div><h2>Throughput trends</h2>
      <p className="pa-muted">{mode === "hourly" ? "Last report day" : "Selected period"} · {report.timezone}</p></div>
      <div className="pa-tabs" role="group" aria-label="Throughput aggregation">
        {([["daily", "Daily"], ["hourly", "Hourly"], ["duration", "AHT"]] as const).map(([id, title]) =>
          <button type="button" key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>{title}</button>)}
      </div>
    </div>
    {rows.length && (!duration || rows.some((item) => item.ahtSeconds !== null)) ?
      <div className="pa-chart" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ left: 0, right: 14, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#dce3ee" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={duration} width={58}
            label={{ value: duration ? "Seconds" : "Cases", angle: -90, position: "insideLeft" }} />
          <Tooltip />
          <Line type="linear" name={duration ? "AHT in seconds" : "Completed cases"} dataKey={duration ? "ahtSeconds" : "completed"}
            stroke="#214fb6" strokeWidth={2} dot={rows.length < 32} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer></div> : <p className="pa-empty">Unavailable for this date range.</p>}
    <details><summary>View chart data</summary><div className="pa-table-wrap"><table><thead><tr>
      <th scope="col">Bucket ({report.timezone})</th><th scope="col">Completed</th><th scope="col">AHT</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.start}><th scope="row">{row.label}</th><td>{row.completed}</td>
        <td>{formatAht(row.ahtSeconds)}</td></tr>)}</tbody></table></div></details>
  </section>;
}

export function AuxChart({ report }: { report: Report }) {
  const items = Object.entries(report.aux?.states ?? {}).map(([state, value]) => ({ state: readable(state), seconds: value }));
  return <section className="wf-panel pa-chart-panel" aria-label="AUX utilization">
    <h2>AUX utilization</h2>
    <p className="pa-muted">Moderating time divided by recorded attendance excluding Offline.</p>
    {report.aux ? <>
      <strong className="pa-number">{report.aux.utilization === null ? "Unavailable" :
        (report.aux.utilization * 100).toFixed(1) + "%"}</strong>
      {items.some((item) => item.seconds > 0) && <div className="pa-chart pa-aux-chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%"><BarChart data={items} layout="vertical">
          <XAxis type="number" tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="state" width={104} tick={{ fontSize: 10 }} />
          <Tooltip /><Bar dataKey="seconds" name="Seconds" fill="#315eaf" isAnimationActive={false} />
        </BarChart></ResponsiveContainer>
      </div>}
      <dl className="pa-mini-grid">{items.map((item) => <div key={item.state}><dt>{item.state}</dt><dd>{seconds(item.seconds)}</dd></div>)}</dl>
    </> : <p className="pa-empty">Unavailable for queue filters.</p>}
  </section>;
}

export function PerformanceComparison({ title, rows, note = "Completed cases in the selected period" }: {
  title: string; rows: MetricRow[]; note?: string;
}) {
  if (!rows.length) return null;
  return <section className="wf-panel pa-chart-panel">
    <h2>{title}</h2>
    <p className="pa-muted">{note}</p>
    <div className="pa-chart" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#dce3ee" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} minTickGap={18} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
        <Tooltip /><Bar name="Completed cases" dataKey="completed" fill="#315eaf" isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer></div>
    <details><summary>View comparison data</summary><dl className="pa-mini-grid">
      {rows.map((row) => <div key={row.id}><dt>{row.name}</dt><dd>{amount(row.completed)} cases · {formatAht(row.ahtSeconds)}</dd></div>)}
    </dl></details>
  </section>;
}

export function PerformanceTable({ rows, dimension, timezone, open }: {
  rows: MetricRow[]; dimension: string; timezone: string;
  open?: (row: MetricRow) => void;
}) {
  const person = dimension === "moderators";
  const queue = dimension === "queues";
  const sharedBacklog = dimension === "organizations" || dimension === "lobs";
  return rows.length ? <div className="pa-table-wrap" tabIndex={0} role="region" aria-label="Performance table">
    <table><thead><tr><th scope="col">Name</th><th scope="col">Completed</th><th scope="col">Handling seconds</th>
      <th scope="col">Weighted AHT</th>
      {sharedBacklog && <th scope="col">Shared backlog</th>}
      {queue && <><th scope="col">Pending</th><th scope="col">Intake</th><th scope="col">Released</th><th scope="col">Expired</th>
        <th scope="col">Active reservations</th><th scope="col">Last completion</th></>}
      {person && <><th scope="col">Moderating seconds</th><th scope="col">Cases / hour</th><th scope="col">Presence</th>
        <th scope="col">AUX</th><th scope="col">Attendance</th><th scope="col">Queue</th><th scope="col">Last seen</th></>}
      {!person && !queue && <><th scope="col">Active moderators</th><th scope="col">Cases / hour</th></>}
    </tr></thead><tbody>{rows.map((row) => <tr key={row.id}>
      <th scope="row">{open ? <button type="button" className="pa-link" onClick={() => open(row)}>{row.name}</button> : row.name}
        {(row.organization || row.detail) && <small>{[row.organization, row.detail].filter(Boolean).join(" · ")}</small>}</th>
      <td>{amount(row.completed)}</td><td>{seconds(row.handlingSeconds)}</td><td>{formatAht(row.ahtSeconds)}</td>
      {sharedBacklog && <td>{amount(row.pending)}</td>}
      {queue && <><td>{amount(row.pending)}</td><td>{amount(row.intake)}</td><td>{amount(row.released)}</td><td>{amount(row.expired)}</td>
        <td>{amount(row.activeReservations)}</td><td>{localTime(row.lastCompletedAt, timezone)}</td></>}
      {person && <><td>{seconds(row.moderatingSeconds)}</td><td>{amount(row.casesPerHour)}</td>
        <td>{readable(row.presence)}</td><td>{readable(row.aux)}</td><td>{readable(row.attendance)}</td>
        <td>{row.currentQueue ?? "Unavailable"}</td><td>{localTime(row.lastSeen, timezone)}</td></>}
      {!person && !queue && <><td>{amount(row.activeModerators)}</td><td>{amount(row.casesPerHour)}</td></>}
    </tr>)}</tbody></table></div> : <p className="pa-empty">No records match these filters.</p>;
}
