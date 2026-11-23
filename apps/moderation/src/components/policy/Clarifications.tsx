import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { errorText, useData, type Actor } from "../../api";
import { readable, usePolicyAction, usePolicyQuery } from "./policyApi";

type Summary = {
  id: string; status: string; revision: number; createdAt: string; supervisorId: string | null;
  queue: { name: string }; version: { number: number; policy: { id: string; name: string } };
  reservation: { id: string; moderatorId: string; status: string; leaseExpiresAt: string;
    case: { code: string }; moderator: { name: string } };
};
type Thread = Summary & { canRespond: boolean; messages: {
  id: string; kind: string; text: string; actorId: string; actorType: string; createdAt: string;
}[] };
type Page = { rows: Summary[]; total: number };
const statuses = ["OPEN","ANSWERED","NEEDS_INFORMATION","ESCALATED","RESOLVED","CLOSED"];

function Conversation({ item, viewer }: { item: Thread; viewer?: Actor }) {
  const action = usePolicyAction();
  const [selected, setSelected] = useState("");
  const [text, setText] = useState("");
  const retry = useRef<{ value: string; id: string } | null>(null);
  const owner = viewer?.userId === item.reservation.moderatorId;
  const buttons: { kind: string; label: string }[] = [];
  if (item.canRespond && ["OPEN","NEEDS_INFORMATION","ESCALATED"].includes(item.status)) buttons.push(
    { kind: "ANSWER", label: "Answer this case" }, { kind: "EXPLAIN_POLICY", label: "Explain pinned policy" },
  );
  if (item.canRespond && ["OPEN","ESCALATED"].includes(item.status)) buttons.push({ kind: "REQUEST_INFORMATION", label: "Request more information" });
  if (item.canRespond && ["OPEN","NEEDS_INFORMATION","ANSWERED"].includes(item.status)) buttons.push({ kind: "ESCALATE", label: "Escalate to policy administrator" });
  if (owner && ["NEEDS_INFORMATION","ANSWERED"].includes(item.status)) buttons.push({ kind: "FOLLOW_UP", label: "Reply" });
  if ((owner && item.status === "ANSWERED") ||
      (item.canRespond && ["ANSWERED","NEEDS_INFORMATION","ESCALATED"].includes(item.status))) buttons.push({ kind: "RESOLVE", label: "Resolve" });
  if (item.canRespond && item.status === "RESOLVED") buttons.push({ kind: "CLOSE", label: "Close" });
  const kind = buttons.some((choice) => choice.kind === selected) ? selected : buttons[0]?.kind ?? "";
  async function send(event: React.FormEvent) {
    event.preventDefault();
    const payload = text.trim();
    const value = [item.id, item.revision, kind, payload].join("\n");
    if (retry.current?.value !== value) retry.current = { value, id: crypto.randomUUID() };
    const response = await action.run("/clarifications/" + item.id + "/respond", {
      revision: item.revision, kind, text: payload, messageId: retry.current.id,
    }, "post", "Clarification updated.");
    if (response) { setText(""); retry.current = null; }
  }
  return <div className="policy-stack">
    <p>{readable(item.status)} · {item.version.policy.name} · Version {item.version.number}</p>
    <ol className="policy-thread">{item.messages.map((entry) => <li key={entry.id}>
      <strong>{readable(entry.kind)}</strong> <small>{entry.actorId === item.reservation.moderatorId ? item.reservation.moderator.name : "Supervisor or administrator"}
        {" · "}{new Date(entry.createdAt).toLocaleString()}</small>
      <p>{entry.text}</p>
    </li>)}</ol>
    {buttons.length > 0 && <form className="policy-stack" onSubmit={send}>
      <label>Clarification action<select value={kind} onChange={(event) => setSelected(event.target.value)}>
        {buttons.map((choice) => <option key={choice.kind} value={choice.kind}>{choice.label}</option>)}</select></label>
      <label>Clarification response<textarea value={text} onChange={(event) => setText(event.target.value)} rows={3} required minLength={3} maxLength={2000} /></label>
      <button type="submit" className="wf-primary" disabled={action.busy}>Send response</button>
    </form>}
    {action.message && <p role="status">{action.message}</p>}{action.error && <p role="alert">{action.error}</p>}
  </div>;
}
export function CaseClarification({ reservationId, expired }: { reservationId: string; expired: boolean }) {
  const { data: actor } = useData<Actor>("/session");
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const retry = useRef<{ text: string; id: string } | null>(null);
  const key = actor?.userId ?? reservationId;
  const list = usePolicyQuery<Page>(key, "/clarifications", { reservationId }, open, 6000);
  const id = list.data?.rows[0]?.id;
  const thread = usePolicyQuery<Thread>(key, "/clarifications/" + id, {}, open && Boolean(id), 6000);
  const action = usePolicyAction();
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (retry.current?.text !== text) retry.current = { text, id: crypto.randomUUID() };
    const result = await action.run("/clarifications", { reservationId, messageId: retry.current.id, text }, "post", "Question sent.");
    if (result) setQuestion("");
  }
  return <details className="mw-panel policy-ui" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="mw-panel-heading"><MessageSquare size={16} /><strong>Policy clarification</strong></summary>
    <div className="mw-body policy-stack">
      <p className="policy-muted">Your case and AUX state stay active while the existing lease permits.</p>
      {expired && <p role="status">This case lease expired. You can read the thread in Clarifications.</p>}
      {(list.error || thread.error) && <p role="alert">{errorText(list.error ?? thread.error)}</p>}
      {open && (list.isPending || (id && thread.isPending)) && <p role="status">Loading clarification…</p>}
      {thread.data && <Conversation item={thread.data} viewer={actor} />}
      {!expired && list.data && !id && <form className="policy-stack" onSubmit={ask}>
        <label>Question<textarea rows={3} value={question} onChange={(event) => setQuestion(event.target.value)}
          required minLength={3} maxLength={2000} /></label>
        <button className="wf-primary" type="submit" disabled={action.busy}>Ask supervisor</button>
      </form>}
      {action.error && <p role="alert">{action.error}</p>}{action.message && <p role="status">{action.message}</p>}
    </div>
  </details>;
}

export function ClarificationPage() {
  const { data: actor } = useData<Actor>("/session");
  const { id } = useParams();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const key = actor?.userId ?? "";
  const list = usePolicyQuery<Page>(key, "/clarifications", { status: status || undefined, page }, !id && Boolean(actor), 12000);
  const detail = usePolicyQuery<Thread>(key, "/clarifications/" + id, {}, Boolean(id && actor), 6000);
  const active = id ? detail : list;
  return <div className="policy-ui policy-stack">
    <div className="policy-title"><div><h1>{id ? "Policy clarification" : "Clarifications"}</h1>
      <p className="policy-muted">{id ? detail.data?.reservation.case.code : "Questions and supervisor guidance for moderation cases."}</p></div>
      {id && <Link to="/clarifications">Back to clarifications</Link>}
    </div>
    {active.isPending && <p role="status">Loading clarifications…</p>}{active.error && <p role="alert">{errorText(active.error)}</p>}
    {detail.data && id && <section className="wf-panel">
      <Conversation key={id} item={detail.data} viewer={actor} />
      {detail.data.status === "ESCALATED" && actor && (actor.superAdmin || ["ADMIN","MODERATION_ADMIN"].includes(actor.role)) &&
        <Link to={"/policies/" + detail.data.version.policy.id}>Open policy to create an amendment draft</Link>}
    </section>}
    {!id && <section className="wf-panel policy-stack">
      <label>Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
        <option value="">All states</option>{statuses.map((item) => <option key={item} value={item}>{readable(item)}</option>)}</select></label>
      {list.data && !list.data.rows.length && <p>No clarification requests match.</p>}
      {list.data?.rows.length ? <div className="policy-table"><table><thead><tr><th>Case</th><th>Queue</th><th>Moderator</th><th>Policy</th><th>Status</th></tr></thead>
        <tbody>{list.data.rows.map((item) => <tr key={item.id}><th scope="row"><Link to={"/clarifications/" + item.id}>{item.reservation.case.code}</Link></th>
          <td>{item.queue.name}</td><td>{item.reservation.moderator.name}</td><td>{item.version.policy.name} v{item.version.number}</td>
          <td>{readable(item.status)}</td></tr>)}</tbody></table></div> : null}
      {list.data && (page > 1 || list.data.total > 20) && <div className="policy-actions">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span>
        <button disabled={page * 20 >= list.data.total} onClick={() => setPage(page + 1)}>Next</button>
      </div>}
    </section>}
  </div>;
}
