import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, errorText, useData, type Actor } from "../api";
import { attendanceHttp } from "../attendanceApi";
import {
  auxLabels,
  formatAuxTime,
  type AuxStatus,
} from "../components/GlobalAuxControl";

type StaffRow = {
  id: string;
  name: string;
  role: string;
  organization: { name: string } | null;
  lob: { name: string } | null;
  teamLinks: { team: { name: string } }[];
  state: AuxStatus | null;
  startedAt: string | null;
  presence: string;
  lastSeenAt: string | null;
  attendanceStatus: string;
  activeCase: boolean;
};
type Overview = {
  serverTime: string;
  total: number;
  online: number;
  page: number;
  counts: Record<AuxStatus, number>;
  rows: StaffRow[];
};
type Interval = {
  id: string;
  state: AuxStatus;
  startedAt: string;
  endedAt: string | null;
  seconds: number;
};
type History = {
  rows: {
    id: string;
    loginAt: string;
    startedAt: string;
    endedAt: string | null;
    logoutAt: string | null;
    endReason: string | null;
    elapsedSeconds: number;
    workingSeconds: number;
    intervals: Interval[];
  }[];
  totals: Record<AuxStatus, number>;
  totalAttendanceSeconds: number;
  totalSessions: number;
  loginCount: number;
  page: number;
  reportingTimezone: string;
};
type Choice = { id: string; name: string };
const dateTime = (input: string | null) =>
  input
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(input))
    : "—";
const friendly = (label: string) =>
  label
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
function useReport<T>(
  path: string,
  live = false,
  baseURL = attendanceHttp.baseURL,
) {
  const actor = useData<Actor>("/session").data;
  return useQuery({
    queryKey: ["attendance-report", actor?.userId, actor?.role, path],
    enabled: !!actor,
    queryFn: async ({ signal }) =>
      (await api.get<T>(path, { baseURL, signal })).data,
    retry: false,
    refetchInterval: live ? 15000 : false,
    refetchIntervalInBackground: false,
  });
}
function Feedback({
  pending,
  error,
  retry,
}: {
  pending: boolean;
  error: unknown;
  retry: () => unknown;
}) {
  if (pending) return <p role="status">Loading attendance…</p>;
  return error ? (
    <div className="wf-panel" role="alert">
      {errorText(error)} <button onClick={retry}>Retry</button>
    </div>
  ) : null;
}
function useFilters() {
  const [params, setParams] = useSearchParams();
  function filter(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    if (name !== "page") next.delete("page");
    setParams(next, { replace: true });
  }
  return { params, filter };
}
function Pagination({
  page,
  total,
  go,
}: {
  page: number;
  total: number;
  go: (page: number) => void;
}) {
  return (
    <div className="wf-pagination">
      <span>Page {page}</span>
      <button onClick={() => go(page - 1)} disabled={page <= 1}>
        Previous
      </button>
      <button onClick={() => go(page + 1)} disabled={page * 25 >= total}>
        Next
      </button>
    </div>
  );
}
export function AttendanceHistory() {
  const { id } = useParams(),
    { params, filter } = useFilters();
  const query = useReport<History>(
    (id ? "/aux/staff/" + id : "/attendance/me") + "/history?" + params,
  );
  return (
    <>
      <div className="wf-heading">
        <div>
          <h1>{id ? "Employee attendance" : "My attendance"}</h1>
          <p>Attendance and AUX durations · UTC</p>
        </div>
      </div>
      <section className="wf-panel wf-form">
        <label>
          From
          <input
            type="date"
            value={params.get("from") ?? ""}
            onChange={(e) => filter("from", e.target.value)}
          />
        </label>
        <label>
          Through
          <input
            type="date"
            value={params.get("through") ?? ""}
            onChange={(e) => filter("through", e.target.value)}
          />
        </label>
      </section>
      <Feedback
        pending={query.isPending}
        error={query.error}
        retry={query.refetch}
      />
      {query.data && !query.error && (
        <>
          <section className="wf-panel">
            <h2>Reporting window</h2>
            <dl className="attendance-totals">
              <div>
                <dt>Attendance</dt>
                <dd>{formatAuxTime(query.data.totalAttendanceSeconds)}</dd>
              </div>
              <div>
                <dt>Sign-ins</dt>
                <dd>{query.data.loginCount}</dd>
              </div>
              {Object.entries(query.data.totals).map(([status, seconds]) => (
                <div key={status}>
                  <dt>{auxLabels[status as AuxStatus]}</dt>
                  <dd>{formatAuxTime(seconds)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="wf-panel">
            <h2>Attendance sessions</h2>
            {!query.data.rows.length && (
              <p className="wf-empty">
                No attendance sessions in this reporting window.
              </p>
            )}
            {query.data.rows.map((session) => (
              <details className="attendance-session" key={session.id}>
                <summary>
                  <strong>{dateTime(session.startedAt)}</strong>
                  <span>
                    {session.endReason ? friendly(session.endReason) : "Active"}
                  </span>
                  <span>{formatAuxTime(session.elapsedSeconds)}</span>
                </summary>
                <dl className="attendance-totals">
                  <div>
                    <dt>Sign-in</dt>
                    <dd>{dateTime(session.loginAt)}</dd>
                  </div>
                  <div>
                    <dt>Ended</dt>
                    <dd>{dateTime(session.endedAt)}</dd>
                  </div>
                  <div>
                    <dt>Sign-out</dt>
                    <dd>{dateTime(session.logoutAt)}</dd>
                  </div>
                  <div>
                    <dt>Working time</dt>
                    <dd>{formatAuxTime(session.workingSeconds)}</dd>
                  </div>
                </dl>
                <div className="wf-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>AUX</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Time in window</th>
                      </tr>
                    </thead>
                    <tbody>
                      {session.intervals.map((interval) => (
                        <tr key={interval.id}>
                          <td>{auxLabels[interval.state]}</td>
                          <td>{dateTime(interval.startedAt)}</td>
                          <td>
                            {interval.endedAt
                              ? dateTime(interval.endedAt)
                              : "Ongoing"}
                          </td>
                          <td>{formatAuxTime(interval.seconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
            <Pagination
              page={query.data.page}
              total={query.data.totalSessions}
              go={(page) => filter("page", String(page))}
            />
          </section>
        </>
      )}
    </>
  );
}
export function WorkforceAux() {
  const { params, filter } = useFilters();
  const query = useReport<Overview>("/aux/organization?" + params, true);
  const orgs = useReport<Choice[]>("/organizations", false, "/api/v1"),
    lobs = useReport<Choice[]>("/lobs", false, "/api/v1"),
    teams = useReport<Choice[]>("/teams");
  const data = query.data;
  return (
    <>
      <div className="wf-heading">
        <div>
          <h1>Workforce AUX</h1>
          <p>Attendance and connection status within your workforce scope.</p>
        </div>
      </div>
      <section className="wf-panel wf-form">
        {(
          [
            ["organizationId", "Organization", orgs.data],
            ["lobId", "Line of business", lobs.data],
            ["teamId", "Team", teams.data],
          ] as const
        ).map(([key, label, rows]) => (
          <label key={key}>
            {label}
            <select
              aria-label={label}
              value={params.get(key) ?? ""}
              onChange={(e) => filter(key, e.target.value)}
            >
              <option value="">All</option>
              {rows?.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Role
          <select
            aria-label="Role"
            value={params.get("role") ?? ""}
            onChange={(e) => filter("role", e.target.value)}
          >
            <option value="">All</option>
            {[
              "MODERATION_ADMIN",
              "MANAGER",
              "MOD_SUPERVISOR",
              "QA_SUPERVISOR",
              "MODERATOR",
              "QA_REVIEWER",
              "VIEWER",
            ].map((role) => (
              <option key={role} value={role}>
                {friendly(role)}
              </option>
            ))}
          </select>
        </label>
        <label>
          AUX state
          <select
            aria-label="AUX state"
            value={params.get("state") ?? ""}
            onChange={(e) => filter("state", e.target.value)}
          >
            <option value="">All</option>
            {Object.entries(auxLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Presence
          <select
            aria-label="Presence"
            value={params.get("presence") ?? ""}
            onChange={(e) => filter("presence", e.target.value)}
          >
            <option value="">All</option>
            {["ONLINE", "DISCONNECTED", "SIGNED_OUT"].map((status) => (
              <option key={status} value={status}>
                {friendly(status)}
              </option>
            ))}
          </select>
        </label>
      </section>
      <Feedback
        pending={query.isPending}
        error={query.error}
        retry={query.refetch}
      />
      {data && !query.error && (
        <>
          <section className="wf-panel">
            <dl className="attendance-totals">
              <div>
                <dt>Employees</dt>
                <dd>{data.total}</dd>
              </div>
              <div>
                <dt>Online</dt>
                <dd>{data.online}</dd>
              </div>
              {Object.entries(data.counts).map(([status, count]) => (
                <div key={status}>
                  <dt>{auxLabels[status as AuxStatus]}</dt>
                  <dd>{count}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="wf-panel">
            <h2>Employees</h2>
            {!data.rows.length ? (
              <p className="wf-empty">No employees match these filters.</p>
            ) : (
              <div className="wf-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Organization / LOB</th>
                      <th>Team</th>
                      <th>AUX</th>
                      <th>Elapsed</th>
                      <th>Presence</th>
                      <th>Attendance</th>
                      <th>Last seen (UTC)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link
                            className="wf-breadcrumb"
                            to={"/workforce/aux/staff/" + row.id}
                          >
                            {row.name}
                          </Link>
                          <small>{friendly(row.role)}</small>
                        </td>
                        <td>
                          {row.organization?.name ?? "—"}
                          <small>{row.lob?.name}</small>
                        </td>
                        <td>
                          {row.teamLinks
                            .map((link) => link.team.name)
                            .join(", ") || "—"}
                        </td>
                        <td>
                          {row.state ? auxLabels[row.state] : "—"}
                          {row.activeCase && <small>Active case</small>}
                        </td>
                        <td>
                          {row.startedAt
                            ? formatAuxTime(
                                (Date.parse(data.serverTime) -
                                  Date.parse(row.startedAt)) /
                                  1000,
                              )
                            : "—"}
                        </td>
                        <td>{friendly(row.presence)}</td>
                        <td>{friendly(row.attendanceStatus)}</td>
                        <td>{dateTime(row.lastSeenAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination
              page={data.page}
              total={data.total}
              go={(page) => filter("page", String(page))}
            />
          </section>
        </>
      )}
    </>
  );
}
