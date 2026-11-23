import { useRef, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { errorText, useData, type Actor } from "../../api";
import { EditableVersion, PolicyEditor } from "./PolicyEditor";
import { PinnedPolicyReference } from "./PolicyReference";
import { handlesPolicy, readable, usePolicyAction, usePolicyQuery, type Named, type PinnedPolicy, type VersionHeader } from "./policyApi";

type Header = { id: string; name: string; description: string; category: string; organization?: Named; versions?: VersionHeader[] };
type Policy = Header & { history: { id: string; action: string; createdAt: string;
  actorSnapshot?: { name?: string }; after?: { status?: string } }[] };
type VersionList = { rows: VersionHeader[]; total: number; page: number };
type Options = { organizations: Named[] };
type Assignment = { id: string; lobId: string | null; queueId: string | null; effectiveFrom: string; effectiveTo: string | null;
  lob: Named | null; queue: Named | null; version: { id: string; number: number } };
type Assignments = { rows: Assignment[]; lobs: Named[]; queues: Named[];
  occupied: { id: string; lobId: string | null; queueId: string | null; version: { policyId: string; policy: Named } }[] };
type Comparison = { before: number; after: number; changes: { key: string; before: unknown; after: unknown }[];
  assignments: { before: { scopeKey: string; effectiveFrom: string; effectiveTo: string | null }[];
    after: { scopeKey: string; effectiveFrom: string; effectiveTo: string | null }[] } };

function PolicyList({ actor }: { actor: Actor }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const list = usePolicyQuery<{ rows: Header[]; total: number }>(actor.userId, "/policies", { search, status: status || undefined, page });
  return <>
    <div className="policy-title"><div><h1>Moderation policies</h1><p className="policy-muted">Manage guidance, versions and queue assignments.</p></div><Link to="/policies/new">Create policy</Link></div>
    <section className="wf-panel policy-stack">
      <div className="policy-actions"><label>Search policies<input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label>
        <label>Version status<select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Any status</option>{["DRAFT","IN_REVIEW","PUBLISHED","ARCHIVED"].map((item) => <option value={item} key={item}>{readable(item)}</option>)}</select></label></div>
      {list.isPending && <p role="status">Loading policies…</p>}{list.error && <p role="alert">{errorText(list.error)}</p>}
      {list.data && (!list.data.rows.length ? <p>No policies match.</p> :
        <div className="policy-table"><table><thead><tr><th>Policy</th><th>Organization</th><th>Category</th><th>Latest version</th></tr></thead>
          <tbody>{list.data.rows.map((item) => <tr key={item.id}><th scope="row"><Link to={"/policies/" + item.id}>{item.name}</Link></th>
            <td>{item.organization?.name}</td><td>{item.category}</td><td>{item.versions?.[0]
              ? "v" + item.versions[0].number + " · " + readable(item.versions[0].status) : "No versions"}</td></tr>)}</tbody></table></div>)}
      {list.data && (page > 1 || list.data.total > 20) && <div className="policy-actions">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span>
        <button disabled={page * 20 >= list.data.total} onClick={() => setPage(page + 1)}>Next</button></div>}
    </section>
  </>;
}
function NewPolicy({ actor }: { actor: Actor }) {
  const options = usePolicyQuery<Options>(actor.userId, "/policies/options");
  const navigate = useNavigate();
  const action = usePolicyAction();
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = { organizationId: form.get("organizationId"), name: form.get("name"),
      category: form.get("category"), description: form.get("description") };
    const row = await action.run<Header>("/policies", input);
    if (row) navigate("/policies/" + row.id);
  }
  return <><div className="policy-title"><h1>Create policy</h1><Link to="/policies">Back to policies</Link></div>
    <form className="wf-panel policy-stack" onSubmit={create}>
      <label>Organization<select name="organizationId" required defaultValue={actor.organizationId ?? ""}>
        <option value="">Choose an organization</option>{options.data?.organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
      <label>Policy name<input name="name" minLength={3} maxLength={100} required /></label>
      <label>Category<input name="category" maxLength={80} required /></label>
      <label>Description<textarea name="description" maxLength={500} rows={2} /></label>
      <button type="submit" className="wf-primary" disabled={action.busy || !options.data}>Create policy</button>
      {(action.error || options.error) && <p role="alert">{action.error || errorText(options.error)}</p>}
    </form></>;
}
function AssignedGuidance({ actor }: { actor: Actor }) {
  const list = usePolicyQuery<{ rows: { queue: Named; version: PinnedPolicy | null }[] }>(actor.userId, "/policies/effective");
  return <><div className="policy-title"><h1>Queue policies</h1></div>
    {list.isPending && <p role="status">Loading assigned policies…</p>}{list.error && <p role="alert">{errorText(list.error)}</p>}
    {list.data && !list.data.rows.length && <p>No subscribed queues with policy access.</p>}
    {list.data?.rows.map(({ queue, version }) => <section key={queue.id} className="wf-panel policy-stack"><h2>{queue.name}</h2>
      {version ? <PinnedPolicyReference policy={version} /> : <p>This queue uses its existing task review configuration.</p>}</section>)}</>;
}

function AssignmentEditor({ actor, id, versions }: { actor: Actor; id: string; versions: VersionHeader[] }) {
  const data = usePolicyQuery<Assignments>(actor.userId, "/policies/" + id + "/assignments");
  const [kind, setKind] = useState("organization");
  const [target, setTarget] = useState("");
  const action = usePolicyAction();
  const latest = versions.find(({ status }) => status === "PUBLISHED");
  const current = data.data?.occupied.find((row) => (row.lobId ?? null) === (kind === "lob" ? target : null)
    && (row.queueId ?? null) === (kind === "queue" ? target : null));
  const owned = current?.version.policyId === id;
  async function save(remove: boolean) {
    if (!remove && current && !owned && !window.confirm("Replace the active assignment from " + current.version.policy.name + "?")) return;
    await action.run("/policies/" + id + "/assignments", {
      ...(kind === "organization" ? {} : { [kind + "Id"]: target }),
      versionId: remove ? null : latest?.id, expectedAssignmentId: current?.id ?? null,
    }, "put", remove ? "Assignment removed." : "Policy assigned.");
  }
  return <section className="wf-panel policy-stack">
    <h2>Policy assignments</h2><p className="policy-muted">Queue overrides LOB, then the organization default. Publishing a new version advances this policy’s active assignments.</p>
    {data.isPending && <p role="status">Loading assignments…</p>}{data.error && <p role="alert">{errorText(data.error)}</p>}
    {data.data && <><div className="policy-actions">
      <label>Assignment scope<select value={kind} onChange={(e) => { setKind(e.target.value); setTarget(""); }}>
        <option value="organization">Organization default</option><option value="lob">Line of business</option><option value="queue">Queue</option></select></label>
      {kind !== "organization" && <label>{kind === "lob" ? "Line of business" : "Queue"}<select value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">Choose scope</option>{(kind === "lob" ? data.data.lobs : data.data.queues).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
      <button type="button" className="wf-primary" disabled={action.busy || !latest || (kind !== "organization" && !target)} onClick={() => void save(false)}>Assign published version</button>
      {owned && <button type="button" onClick={() => void save(true)} disabled={action.busy}>Remove assignment</button>}
    </div>
      {current && <p>Current policy · {current.version.policy.name}</p>}
      {data.data.rows.length ? <div className="policy-table"><table><thead><tr><th>Scope</th><th>Version</th><th>Effective from</th><th>Effective through</th></tr></thead>
        <tbody>{data.data.rows.map((row) => <tr key={row.id}><th scope="row">{row.queue?.name ?? row.lob?.name ?? "Organization default"}</th>
          <td>v{row.version.number}</td><td>{new Date(row.effectiveFrom).toLocaleString()}</td>
          <td>{row.effectiveTo ? new Date(row.effectiveTo).toLocaleString() : "Active"}</td></tr>)}</tbody></table></div> : <p>No assignments for this policy.</p>}</>}
    {action.error && <p role="alert">{action.error}</p>}{action.message && <p role="status">{action.message}</p>}
  </section>;
}
function ValueSummary({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) return <p>None</p>;
  if (Array.isArray(value)) return <ul>{value.map((entry, i) => <li key={i}><ValueSummary value={entry} /></li>)}</ul>;
  if (typeof value === "object") return <dl>{Object.entries(value).filter(([, item]) => item !== "" && item !== undefined)
    .map(([key, entry]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1").replace(/^./, (first) => first.toUpperCase())}</dt>
      <dd><ValueSummary value={entry} /></dd></div>)}</dl>;
  return <span>{typeof value === "boolean" ? value ? "Yes" : "No" : String(value)}</span>;
}
function VersionCompare({ actor, id, versions }: { actor: Actor; id: string; versions: VersionHeader[] }) {
  const [before, setBefore] = useState(versions[1]?.id ?? "");
  const [after, setAfter] = useState(versions[0]?.id ?? "");
  const compare = usePolicyQuery<Comparison>(actor.userId, "/policies/" + id + "/versions/compare", { before, after }, Boolean(before && after));
  return <section className="wf-panel policy-stack"><h2>Compare versions</h2><div className="policy-actions">
    <label>From version<select value={before} onChange={(e) => setBefore(e.target.value)}><option value="">Choose version</option>
      {versions.map((row) => <option key={row.id} value={row.id}>Version {row.number}</option>)}</select></label>
    <label>To version<select value={after} onChange={(e) => setAfter(e.target.value)}><option value="">Choose version</option>
      {versions.map((row) => <option key={row.id} value={row.id}>Version {row.number}</option>)}</select></label></div>
    {compare.error && <p role="alert">{errorText(compare.error)}</p>}
    {compare.data && !compare.data.changes.length && <p>No policy content changes.</p>}
    {compare.data?.changes.map((change) => <section className="policy-entry" key={change.key}><h3>{readable(change.key.replace(/([A-Z])/g, " $1"))}</h3>
      <div className="policy-field-grid"><div><h4>Version {compare.data?.before}</h4><ValueSummary value={change.before} /></div>
        <div><h4>Version {compare.data?.after}</h4><ValueSummary value={change.after} /></div></div></section>)}
    {compare.data && <section className="policy-entry"><h3>Assignment history</h3><div className="policy-field-grid">
      {([["before", compare.data.before], ["after", compare.data.after]] as const).map(([key, number]) => <div key={key}><h4>Version {number}</h4>
        <ValueSummary value={compare.data?.assignments[key]} /></div>)}</div></section>}
  </section>;
}

function PolicyDetail({ actor }: { actor: Actor }) {
  const { id } = useParams();
  const [search, setSearch] = useSearchParams();
  const tab = search.get("tab") ?? "Versions";
  const versionId = search.get("version");
  const [page, setPage] = useState(1);
  const [clone, setClone] = useState("");
  const serial = useRef<{ id: string; key: string } | null>(null);
  const base = "/policies/" + id;
  const policy = usePolicyQuery<Policy>(actor.userId, base);
  const versions = usePolicyQuery<VersionList>(actor.userId, base + "/versions", { page });
  const version = usePolicyQuery<EditableVersion>(actor.userId, base + "/versions/" + versionId, {}, Boolean(versionId && tab === "Versions"));
  const action = usePolicyAction();
  function select(value: string, selected?: string) { setSearch({ tab: value, ...(selected ? { version: selected } : {}) }); }
  async function addDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const changeSummary = String(new FormData(event.currentTarget).get("summary"));
    const key = clone + "\n" + changeSummary;
    if (serial.current?.key !== key) serial.current = { key, id: crypto.randomUUID() };
    const row = await action.run<VersionHeader>(base + "/versions", {
      draftId: serial.current.id, sourceVersionId: clone || undefined, changeSummary,
    }, "post");
    if (row) { serial.current = null; setPage(1); select("Versions", row.id); }
  }
  const entries = versions.data?.rows ?? [];
  return <>
    <Link to="/policies">All policies</Link>
    <div className="policy-title"><div><h1>{policy.data?.name ?? "Policy details"}</h1>
      {policy.data && <p className="policy-muted">{policy.data.category}{policy.data.description ? " · " + policy.data.description : ""}</p>}</div></div>
    {policy.isPending && <p role="status">Loading policy…</p>}{policy.error && <p role="alert">{errorText(policy.error)}</p>}
    {policy.data && id && <>
      <div className="policy-actions" role="group" aria-label="Policy views">{["Versions","Compare","Assignments","History"].map((item) =>
        <Link key={item} to={"?tab=" + encodeURIComponent(item)} aria-current={tab === item ? "page" : undefined}>{item}</Link>)}</div>
      {tab === "Assignments" && <AssignmentEditor actor={actor} id={id} versions={entries} />}
      {tab === "Compare" && versions.data && <VersionCompare actor={actor} id={id} versions={entries} />}
      {tab === "History" && <section className="wf-panel"><h2>Audit history</h2><ol className="policy-thread">{policy.data.history.map((event) =>
        <li key={event.id}><strong>{readable(event.action.replace(/^POLICY_/, ""))}</strong><p>{event.actorSnapshot?.name ?? "Staff"}
          {" · "}{new Date(event.createdAt).toLocaleString()}{event.after?.status ? " · " + readable(event.after.status) : ""}</p></li>)}</ol></section>}
      {tab === "Versions" && <>
        <section className="wf-panel policy-stack"><div className="policy-title"><h2>Version history</h2></div>
          {versions.error && <p role="alert">{errorText(versions.error)}</p>}
          <div className="policy-actions">{entries.map((row) => <Link key={row.id} aria-current={versionId === row.id ? "page" : undefined}
            to={"?tab=Versions&version=" + row.id}>Version {row.number} · {readable(row.status)}</Link>)}</div>
          {versions.data && (page > 1 || versions.data.total > 25) && <div className="policy-actions">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous versions</button>
            <button disabled={page * 25 >= versions.data.total} onClick={() => setPage(page + 1)}>More versions</button></div>}
          <form className="policy-actions" onSubmit={addDraft}><label>Start from<select value={clone} onChange={(e) => setClone(e.target.value)}>
            <option value="">Blank version</option>{entries.map((row) => <option key={row.id} value={row.id}>Version {row.number}</option>)}</select></label>
            <label>Draft change summary<input name="summary" minLength={3} maxLength={500} required /></label>
            <button type="submit" className="wf-primary" disabled={action.busy}>Create draft</button></form>
          {action.error && <p role="alert">{action.error}</p>}
        </section>
        {versionId && version.isPending && <p role="status">Loading version…</p>}{version.error && <p role="alert">{errorText(version.error)}</p>}
        {version.data && <PolicyEditor key={version.data.id} policyId={id} version={version.data} refresh={() => void version.refetch()} />}
      </>}
    </>}
  </>;
}

export function PoliciesPage() {
  const { data: actor } = useData<Actor>("/session");
  if (!actor) return <p role="status">Checking policy access…</p>;
  return <div className="policy-ui policy-stack"><Routes>
    <Route index element={handlesPolicy(actor) ? <PolicyList actor={actor} /> : <AssignedGuidance actor={actor} />} />
    <Route path="guidance" element={<AssignedGuidance actor={actor} />} />
    <Route path="new" element={handlesPolicy(actor) ? <NewPolicy actor={actor} /> : <p role="alert">Policy administration access is restricted.</p>} />
    <Route path=":id" element={handlesPolicy(actor) ? <PolicyDetail actor={actor} /> : <p role="alert">Policy administration access is restricted.</p>} />
  </Routes></div>;
}
