import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  ArrowDownUp,
  Building2,
  Layers3,
  Plus,
  Search,
  UsersRound,
  Workflow,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { errorText, useData, type Actor } from "../api";

const api = axios.create({
  baseURL: "/api/v1",
  headers: { "X-Prakaro-Console": "1" },
  timeout: 10000,
});
type Resource = "organizations" | "lobs" | "staff" | "teams";
type RecordRow = {
  id: string;
  name: string;
  code?: string;
  description?: string;
  active?: boolean;
  queueDelegated?: boolean;
  organizationId?: string;
  organization?: { name: string };
  lobId?: string;
  employeeCode?: string;
  email?: string;
  role?: string;
  kind?: string;
  status?: string;
  lastLoginAt?: string;
  _count?: Record<string, number>;
  lobs?: RecordRow[];
  teams?: RecordRow[];
  staff?: RecordRow[];
  recent?: { id: string; action: string; createdAt: string }[];
  links?: { moderatorId: string; kind: string; moderator: RecordRow }[];
};
const labels = {
  organizations: "Organizations",
  lobs: "Lines of business",
  staff: "Employees",
  teams: "Teams",
};
const singular = {
  organizations: "organization",
  lobs: "LOB",
  staff: "employee",
  teams: "team",
};
const url = (resource: Resource) =>
  resource === "staff" || resource === "teams"
    ? "/workforce/" + resource
    : "/" + resource;
const roles = [
  "MODERATION_ADMIN",
  "MANAGER",
  "MOD_SUPERVISOR",
  "QA_SUPERVISOR",
  "MODERATOR",
  "QA_REVIEWER",
  "VIEWER",
];
const friendly = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());

function useWorkforce<T>(path: string, actor?: Actor) {
  return useQuery({
    queryKey: ["workforce", actor?.userId, actor?.role, path],
    enabled: !!actor,
    retry: false,
    queryFn: async () => (await api.get<T>(path)).data,
  });
}
function useSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      path,
      method,
      data,
    }: {
      path: string;
      method: string;
      data?: unknown;
    }) => api.request({ url: path, method, data }),
    onSuccess: () => qc.invalidateQueries(),
  });
}
function Message({
  query,
}: {
  query: { isPending: boolean; error: unknown; refetch: () => unknown };
}) {
  if (query.isPending) return <p role="status">Loading…</p>;
  if (query.error)
    return (
      <div role="alert">
        {errorText(query.error)} <button onClick={query.refetch}>Retry</button>
      </div>
    );
  return null;
}
function Selector({
  resource,
  value,
  change,
  actor,
  org,
  optional = false,
}: {
  resource: Resource;
  value: string;
  change: (v: string) => void;
  actor: Actor;
  org?: string;
  optional?: boolean;
}) {
  const [search, setSearch] = useState("");
  const query = new URLSearchParams({ search });
  if (org && org !== "pending") query.set("organizationId", org);
  const found = useWorkforce<RecordRow[]>(
    url(resource) + "?" + query.toString(),
    org === "pending" ? undefined : actor,
  );
  const options = (found.data ?? []).filter(
    (row) => !org || row.organizationId === org,
  );
  return (
    <div className="wf-selector">
      <input
        aria-label={"Search " + labels[resource]}
        placeholder={"Search " + labels[resource].toLowerCase()}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select
        aria-label={labels[resource]}
        required={!optional}
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">
          {optional ? "Unassigned" : "Select " + singular[resource]}
        </option>
        {value && !options.some((row) => row.id === value) && (
          <option value={value}>Current selection</option>
        )}
        {options.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name} {row.code ?? row.employeeCode ?? ""}
          </option>
        ))}
      </select>
    </div>
  );
}
function Editor({
  resource,
  row,
  actor,
  close,
}: {
  resource: Resource;
  row?: RecordRow;
  actor: Actor;
  close: () => void;
}) {
  const save = useSave(),
    [org, setOrg] = useState(row?.organizationId ?? ""),
    [lob, setLob] = useState(row?.lobId ?? "");
  const own = useWorkforce<RecordRow[]>("/organizations", actor);
  const organization = actor.superAdmin ? org : (own.data?.[0]?.id ?? "");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "");
    const common = {
      name: value("name"),
      code: value("code"),
      active: value("active") === "true",
    };
    let data: unknown;
    if (resource === "staff")
      data = {
        name: common.name,
        employeeCode: common.code,
        organizationId: organization,
        lobId: lob,
        status: value("status"),
        role: value("role"),
        ...(!row ? { email: value("email"), password: value("password") } : {}),
      };
    else if (resource === "teams")
      data = {
        ...common,
        ...(!row ? { organizationId: organization, kind: value("kind") } : {}),
      };
    else if (resource === "organizations" && !actor.superAdmin)
      data = { name: common.name, description: value("description") };
    else
      data = {
        ...common,
        description: value("description"),
        ...(resource === "organizations" && row
          ? { queueDelegated: form.has("queueDelegated") }
          : {}),
      };
    save.mutate(
      {
        path: url(resource) + (row ? "/" + row.id : ""),
        method: row ? "PATCH" : "POST",
        data,
      },
      { onSuccess: close },
    );
  }
  return (
    <section
      className="wf-panel"
      aria-label={(row ? "Edit " : "Create ") + singular[resource]}
    >
      <h2>
        {row ? "Edit" : "Create"} {singular[resource]}
      </h2>
      <form className="wf-form" onSubmit={submit}>
        <label>
          Name
          <input
            name="name"
            defaultValue={row?.name}
            required
            maxLength={100}
          />
        </label>
        {(resource !== "organizations" || actor.superAdmin) && (
          <label>
            {resource === "staff" ? "Employee code" : "Code"}
            <input
              name="code"
              defaultValue={row?.employeeCode ?? row?.code}
              required
              pattern="[A-Z0-9_\-]{2,40}"
            />
          </label>
        )}
        {(resource === "organizations" || resource === "lobs") && (
          <label>
            Description
            <textarea
              name="description"
              defaultValue={row?.description}
              maxLength={500}
            />
          </label>
        )}
        {actor.superAdmin &&
          (resource === "staff" || (resource === "teams" && !row)) && (
            <div>
              <span>Organization</span>
              <Selector
                resource="organizations"
                actor={actor}
                value={org}
                change={(v) => {
                  setOrg(v);
                  setLob("");
                }}
              />
            </div>
          )}
        {resource === "staff" && (
          <>
            <div>
              <span>Line of business</span>
              <Selector
                resource="lobs"
                actor={actor}
                org={organization || "pending"}
                value={lob}
                change={setLob}
              />
            </div>
            <label>
              Role
              <select
                name="role"
                aria-label="Role"
                defaultValue={
                  row?.role === "MODERATION_MANAGER"
                    ? "MANAGER"
                    : row?.role === "SUPERVISOR"
                      ? "MOD_SUPERVISOR"
                      : row?.role === "ADMIN"
                        ? "MODERATION_ADMIN"
                        : (row?.role ?? "MODERATOR")
                }
              >
                {roles
                  .filter(
                    (role) => actor.superAdmin || role !== "MODERATION_ADMIN",
                  )
                  .map((role) => (
                    <option key={role} value={role}>
                      {friendly(role)}
                    </option>
                  ))}
              </select>
            </label>
            {!row && (
              <>
                <label>
                  Email
                  <input name="email" type="email" required />
                </label>
                <label>
                  Initial password
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    required
                  />
                </label>
              </>
            )}
            <label>
              Status
              <select
                name="status"
                aria-label="Employee status"
                defaultValue={row?.status ?? "ACTIVE"}
              >
                <option value="ACTIVE">Active</option>
                <option value="DEACTIVATED">Inactive</option>
                <option value="PENDING_ASSIGNMENT">Pending assignment</option>
              </select>
            </label>
          </>
        )}
        {resource === "teams" && !row && (
          <label>
            Team type
            <select name="kind">
              <option value="MODERATION">Moderation</option>
              <option value="QUALITY">Quality</option>
            </select>
          </label>
        )}
        {resource !== "staff" && (actor.superAdmin || resource === "teams") && (
          <label>
            Status
            <select name="active" defaultValue={String(row?.active ?? true)}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
        )}
        {resource === "organizations" && row && actor.superAdmin && (
          <label className="wf-check">
            <input
              name="queueDelegated"
              type="checkbox"
              defaultChecked={row.queueDelegated}
            />
            Delegate queue configuration
          </label>
        )}
        <div className="wf-actions">
          <button className="wf-primary" disabled={save.isPending}>
            Save
          </button>
          <button type="button" onClick={close}>
            Cancel
          </button>
        </div>
        {save.error && <p role="alert">{errorText(save.error)}</p>}
      </form>
    </section>
  );
}
function Assign({
  resource,
  row,
  actor,
}: {
  resource: Resource;
  row: RecordRow;
  actor: Actor;
}) {
  const [target, setTarget] = useState("");
  const [kind, setKind] = useState("MEMBER");
  const save = useSave();
  const base = url(resource) + "/" + row.id;
  if (resource === "lobs" && actor.superAdmin)
    return (
      <section className="wf-panel">
        <h2>Organization assignment</h2>
        <p>{row.organization?.name ?? "Unassigned"}</p>
        <Selector
          resource="organizations"
          value={target}
          change={setTarget}
          actor={actor}
          optional
        />
        <div className="wf-actions">
          <button
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                path: base + "/assign-organization",
                method: "POST",
                data: { organizationId: target || null },
              })
            }
          >
            Save assignment
          </button>
        </div>
        {save.error && <p role="alert">{errorText(save.error)}</p>}
      </section>
    );
  if (resource !== "teams" || !row.links) return null;
  const manage =
    actor.superAdmin || ["ADMIN", "MODERATION_ADMIN"].includes(actor.role);
  return (
    <section className="wf-panel">
      <h2>Team assignments</h2>
      {row.links.length ? (
        <div className="wf-table-wrap"><table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Assignment</th>
              {manage && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {row.links.map((link) => (
              <tr key={link.moderatorId}>
                <td>{link.moderator.name}</td>
                <td>{friendly(link.kind)}</td>
                {manage && (
                  <td>
                    <button
                      disabled={save.isPending}
                      onClick={() =>
                        save.mutate({
                          path: base + "/members/" + link.moderatorId,
                          method: "DELETE",
                        })
                      }
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : (
        <p>No employees assigned.</p>
      )}
      {manage && (
        <form
          className="wf-form"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({
              path: base + "/members",
              method: "POST",
              data: { staffId: target, kind },
            });
          }}
        >
          <Selector
            resource="staff"
            actor={actor}
            org={row.organizationId}
            value={target}
            change={setTarget}
          />
          <label>
            Assignment
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="MEMBER">Member</option>
              <option value="MANAGER">Manager</option>
              <option value="SUPERVISOR">Supervisor</option>
            </select>
          </label>
          <button className="wf-primary" disabled={save.isPending}>
            Assign employee
          </button>
        </form>
      )}
      {save.error && <p role="alert">{errorText(save.error)}</p>}
    </section>
  );
}
function RelatedRecords({
  resource,
  row,
}: {
  resource: Resource;
  row: RecordRow;
}) {
  const groups = [
    { label: "Assigned lines of business", path: "/lobs", records: row.lobs },
    { label: "Teams", path: "/teams", records: row.teams },
    {
      label:
        resource === "organizations" ? "Organization directors" : "Employees",
      path: "/staff",
      records: row.staff,
    },
  ];
  return (
    <div className="wf-dashboard-grid">
      {groups
        .filter((group) => group.records)
        .map((group) => (
          <section className="wf-panel" key={group.label}>
            <h2>{group.label}</h2>
            {group.records?.length ? (
              <ul className="wf-feed">
                {group.records.map((item) => (
                  <li key={item.id}>
                    <Link
                      className="wf-breadcrumb"
                      to={group.path + "/" + item.id}
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No assignments.</p>
            )}
          </section>
        ))}
      {row.recent && (
        <section className="wf-panel">
          <h2>Recent activity</h2>
          {row.recent.length ? (
            <ul className="wf-feed">
              {row.recent.map((item) => (
                <li key={item.id}>
                  {friendly(item.action)}
                  <time>{new Date(item.createdAt).toLocaleString()}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p>No activity recorded.</p>
          )}
        </section>
      )}
    </div>
  );
}
export function Workforce({ resource }: { resource: Resource }) {
  const { id } = useParams(),
    actor = useData<Actor>("/session").data,
    [filter, setFilter] = useSearchParams(),
    [editing, edit] = useState(false);
  const list = useWorkforce<RecordRow[]>(
    url(resource) + "?" + filter.toString(),
    id ? undefined : actor,
  );
  const detail = useWorkforce<RecordRow>(
    url(resource) + "/" + id,
    id ? actor : undefined,
  );
  if (!actor) return null;
  const director = ["ADMIN", "MODERATION_ADMIN"].includes(actor.role);
  const writable = actor.superAdmin || (director && resource !== "lobs");
  const page = Number(filter.get("page") ?? 1);
  function change(key: string, value: string) {
    const next = new URLSearchParams(filter);
    next.set(key, value);
    if (key !== "page") next.delete("page");
    setFilter(next, { replace: true });
  }
  const path = "/" + resource;
  if (id)
    return (
      <>
        <Link className="wf-breadcrumb" to={path}>
          {labels[resource]}
        </Link>
        <Message query={detail} />
        {detail.data && (
          <>
            <div className="wf-heading">
              <div>
                <h1>{detail.data.name}</h1>
                <p>
                  {detail.data.code ??
                    detail.data.employeeCode ??
                    detail.data.email}
                </p>
              </div>
              {writable &&
                (resource !== "staff" || detail.data.id !== actor.userId) && (
                  <button onClick={() => edit(!editing)}>
                    Edit {singular[resource]}
                  </button>
                )}
            </div>
            {editing && (
              <Editor
                key={id}
                resource={resource}
                actor={actor}
                row={detail.data}
                close={() => edit(false)}
              />
            )}
            <section className="wf-panel">
              <h2>Overview</h2>
              <p>
                {detail.data.status
                  ? friendly(detail.data.status)
                  : detail.data.active
                    ? "Active"
                    : "Inactive"}
              </p>
              {detail.data.description && <p>{detail.data.description}</p>}
              {detail.data.email && <p>{detail.data.email}</p>}
              {detail.data.role && <p>{friendly(detail.data.role)}</p>}
              {Object.entries(detail.data._count ?? {}).map(([key, count]) => (
                <p key={key}>
                  {count} {key}
                </p>
              ))}
            </section>
            <Assign resource={resource} row={detail.data} actor={actor} />
            <RelatedRecords resource={resource} row={detail.data} />
          </>
        )}
      </>
    );
  return (
    <>
      <div className="wf-heading">
        <div>
          <h1>{labels[resource]}</h1>
          <p>
            {resource === "teams"
              ? "Coordinate operational and quality teams."
              : resource === "staff"
                ? "Manage employee membership and roles."
                : resource === "lobs"
                  ? "Manage service lines and organization assignments."
                  : "Manage the organizations operating on Prakaro."}
          </p>
        </div>
        {writable && (actor.superAdmin || resource !== "organizations") && (
          <button className="wf-primary" onClick={() => edit(!editing)}>
            <Plus size={16} />
            Create {singular[resource]}
          </button>
        )}
      </div>
      {editing && (
        <Editor resource={resource} actor={actor} close={() => edit(false)} />
      )}
      <section className="wf-panel wf-directory">
        <div className="wf-filters">
          <label>
            <Search size={16} />
            <input
              aria-label="Search by name"
              placeholder="Search by name"
              value={filter.get("search") ?? ""}
              onChange={(e) => change("search", e.target.value)}
            />
          </label>
          <select
            aria-label="Status filter"
            value={filter.get("status") ?? "all"}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            {resource === "staff" && (
              <option value="pending">Pending assignment</option>
            )}
          </select>
        </div>
        <Message query={list} />
        {list.data &&
          (list.data.length ? (
            <div className="wf-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>
                      <button
                        onClick={() =>
                          change(
                            "sort",
                            filter.get("sort") === "desc" ? "asc" : "desc",
                          )
                        }
                      >
                        Name <ArrowDownUp size={13} />
                      </button>
                    </th>
                    <th>Code</th>
                    <th>Status</th>
                    <th>
                      {resource === "staff"
                        ? "Role"
                        : resource === "lobs"
                          ? "Organization"
                          : resource === "teams"
                            ? "Team type"
                            : "Assigned LOBs"}
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.name}</strong>
                        {row.email && <small>{row.email}</small>}
                      </td>
                      <td>{row.code ?? row.employeeCode ?? "—"}</td>
                      <td>
                        <span
                          className={
                            "wf-badge " +
                            ((row.status ?? (row.active ? "ACTIVE" : "")) ===
                            "ACTIVE"
                              ? "is-active"
                              : "")
                          }
                        >
                          {row.status
                            ? friendly(row.status)
                            : row.active
                              ? "Active"
                              : "Inactive"}
                        </span>
                      </td>
                      <td>
                        {row.role
                          ? friendly(row.role)
                          : row.kind
                            ? friendly(row.kind)
                            : resource === "lobs"
                              ? (row.organization?.name ?? "Unassigned")
                              : (row._count?.lobs ?? "—")}
                      </td>
                      <td>
                        <Link to={path + "/" + row.id}>Open</Link>
                        {resource === "staff" && <> · <Link to={"/operations/live?employeeId=" + row.id}>Work status</Link></>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="wf-empty">
              No matching {labels[resource].toLowerCase()}.
            </p>
          ))}
        <div className="wf-pagination">
          <span>Page {page}</span>
          <button
            disabled={page <= 1}
            onClick={() => change("page", String(page - 1))}
          >
            Previous
          </button>
          <button
            disabled={(list.data?.length ?? 0) < 25}
            onClick={() => change("page", String(page + 1))}
          >
            Next
          </button>
        </div>
      </section>
    </>
  );
}
type DashboardData = {
  organizations: number;
  activeOrganizations: number;
  lobs: number;
  staffCount: number;
  activeStaff: number;
  teams: number;
  distribution: { role: string; _count: number }[];
  recent: { id: string; action: string; createdAt: string }[];
};
export function WorkforceDashboard() {
  const actor = useData<Actor>("/session").data,
    q = useWorkforce<DashboardData>("/workforce/dashboard", actor);
  const data = q.data;
  return (
    <>
      <div className="wf-heading">
        <div>
          <h1>
            {actor?.superAdmin ? "Global dashboard" : "Workforce dashboard"}
          </h1>
          <p>
            {actor?.organization ?? "Platform operations"} · Organization and
            workforce overview
          </p>
        </div>
        {actor?.superAdmin && (
          <Link className="wf-primary" to="/organizations">
            <Building2 size={16} />
            Manage organizations
          </Link>
        )}
      </div>
      <Message query={q} />
      {data && (
        <>
          <div className="wf-metrics">
            {(
              [
                [
                  Building2,
                  "Organizations",
                  data.organizations,
                  `${data.activeOrganizations} active`,
                ],
                [Layers3, "Lines of business", data.lobs, ""],
                [
                  UsersRound,
                  "Employees",
                  data.staffCount,
                  `${data.activeStaff} active`,
                ],
                [Workflow, "Teams", data.teams, ""],
              ] as const
            ).map(([Icon, title, value, caption]) => (
              <section className="wf-panel" key={title}>
                <Icon size={18} />
                <h2>{title}</h2>
                <strong>{value}</strong>
                {caption && <p>{caption}</p>}
              </section>
            ))}
          </div>
          <div className="wf-dashboard-grid">
            <section className="wf-panel">
              <h2>Employees by role</h2>
              {data.distribution.length ? (
                <div
                  role="img"
                  aria-label="Employees by role"
                  style={{ height: 230 }}
                >
                  <ResponsiveContainer>
                    <BarChart
                      data={data.distribution.map((row) => ({
                        role: friendly(row.role),
                        count: row._count,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="role" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#2563eb" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="wf-empty">No employees in this scope.</p>
              )}
            </section>
            {(actor?.superAdmin ||
              actor?.role === "MODERATION_ADMIN" ||
              actor?.role === "ADMIN") && (
              <section className="wf-panel">
                <h2>Recent administrative activity</h2>
                {data.recent.length ? (
                  <ol className="wf-feed">
                    {data.recent.map((item) => (
                      <li key={item.id}>
                        <strong>{friendly(item.action)}</strong>
                        <time>{new Date(item.createdAt).toLocaleString()}</time>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="wf-empty">
                    No administrative activity recorded.
                  </p>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </>
  );
}
