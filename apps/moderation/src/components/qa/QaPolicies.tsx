import { useState, type FormEvent } from "react";
import { errorText, type Actor } from "../../api";
import { useQa, useQaAction, type PolicyData } from "./qa-api";

export function QaPolicies({ actor }: { actor: Actor }) {
  const data = useQa<PolicyData>(actor, "/qa/policies");
  const change = useQaAction();
  const [organizationId, setOrg] = useState(actor.organizationId ?? "");
  const [target, setTarget] = useState("");
  const [kind, setKind] = useState<"organization" | "lob" | "queue">("organization");
  const group = organizationId || data.data?.organizations[0]?.id || "";
  const active = data.data?.policies.find((policy) => !policy.effectiveTo && policy.organizationId === group &&
    (kind === "organization" ? !policy.lobId && !policy.queueId : kind === "lob" ? policy.lobId === target : policy.queueId === target));
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await change.perform("/qa/policies", {
      organizationId: group, ...(kind === "organization" ? {} : { [kind + "Id"]: target }),
      expectedVersion: active?.version ?? 0, rate: Math.round(Number(form.get("rate")) * 100),
      enabled: form.get("enabled") === "on", passScore: Number(form.get("pass")), failScore: Number(form.get("fail")),
    }, "Sampling policy version saved.");
  }
  return <>
    <div className="qa-heading"><div><h1>Sampling policies</h1>
      <p className="qa-muted">Queue policies take precedence over LOB policies and organization defaults.</p></div></div>
    {data.isPending && <p role="status">Loading sampling policies…</p>}
    {data.error && <p role="alert">{errorText(data.error)}</p>}
    {data.data && <section className="wf-panel"><h2>Configure sampling</h2>
      <div className="qa-filters">
        <label>Organization<select value={group} onChange={(event) => { setOrg(event.target.value); setTarget(""); }}>
          {data.data.organizations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>Policy scope<select value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setTarget(""); }}>
          <option value="organization">Organization default</option><option value="lob">Line of business</option><option value="queue">Queue</option>
        </select></label>
        {kind !== "organization" && <label>{kind === "lob" ? "Line of business" : "Queue"}<select value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="">Select scope</option>{(kind === "lob" ? data.data.lobs : data.data.queues).filter((item) => item.organizationId === group)
            .map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
      </div>
      <form className="qa-filters" onSubmit={save} key={[group, kind, target, active?.version].join(":")}>
        <label>Sampling rate (%)<input name="rate" type="number" min="0" max="100" step=".01" required defaultValue={(active?.rate ?? 0) / 100} /></label>
        <label>Pass score<input name="pass" type="number" min="0" max="100" required defaultValue={active?.passScore ?? 100} /></label>
        <label>Fail score<input name="fail" type="number" min="0" max="100" required defaultValue={active?.failScore ?? 0} /></label>
        <label className="qa-check"><input type="checkbox" name="enabled" defaultChecked={active?.enabled ?? false} /> Enable sampling</label>
        <button type="submit" disabled={change.pending || !group || (kind !== "organization" && !target)}>Save policy version</button>
      </form>
    </section>}
    {change.error && <p role="alert">{change.error}</p>}{change.message && <p role="status">{change.message}</p>}
    <section className="wf-panel"><h2>Policy history</h2>
      {data.data?.policies.length ? <div className="qa-table-wrap"><table><thead><tr>
        <th>Scope</th><th>Version</th><th>Rate</th><th>State</th><th>Effective from</th>
      </tr></thead><tbody>{data.data.policies.map((item) => <tr key={item.id}>
        <th scope="row">{item.queue?.name ?? item.lob?.name ?? item.organization.name}</th><td>{item.version}</td>
        <td>{item.rate / 100}%</td><td>{item.effectiveTo ? "Superseded" : item.enabled ? "Enabled" : "Disabled"}</td>
        <td>{new Date(item.effectiveFrom).toLocaleString()}</td></tr>)}</tbody></table></div> : <p>No sampling policies have been recorded.</p>}
    </section>
    <section className="wf-panel"><h2>Manual selection</h2>
      <form className="qa-actions" onSubmit={(event) => {
        event.preventDefault();
        const decisionId = String(new FormData(event.currentTarget).get("decisionId"));
        void change.perform<{ id: string | null }>("/qa/samples/manual", { decisionId }, "Manual sampling request completed.");
      }}>
        <label>Completed decision ID<input required name="decisionId" placeholder="Decision UUID" /></label>
        <button type="submit" disabled={change.pending}>Select for review</button>
      </form></section>
  </>;
}
