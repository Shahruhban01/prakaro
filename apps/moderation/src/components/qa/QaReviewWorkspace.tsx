import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { errorText, type Actor } from "../../api";
import { categories, optionalLabel, severities, useQa, useQaAction, type ReviewDetail } from "./qa-api";
import { PinnedPolicyReference } from "../policy/PolicyReference";

type Action = ReturnType<typeof useQaAction>;
const text = z.string().trim().min(3).max(500);
export function OriginalDecisionPanel({ item }: { item: ReviewDetail }) {
  const snapshot = item.decision.qaSnapshot;
  const pinned = item.decision.pinnedPolicy;
  const labels = new Map(pinned?.document.fields.map(({ id, label }) => [id, label]) ??
    snapshot?.form.map((question) => [question.key, question.label]));
  return <section className="wf-panel qa-panel" aria-labelledby="original-decision">
    <h2 id="original-decision">Original decision</h2>
    <dl className="qa-facts">
      <div><dt>Outcome</dt><dd>{optionalLabel(item.decision.action)}</dd></div>
      <div><dt>Moderator</dt><dd>{item.moderator.name}</dd></div>
      <div><dt>Decision</dt><dd>Version {item.decision.version}</dd></div>
      <div><dt>Review policy</dt><dd>{pinned ? pinned.policy.name + " v" + pinned.number : "Legacy queue configuration v" + item.decision.policyVersion}</dd></div>
      <div><dt>Submitted</dt><dd>{new Date(item.decision.createdAt).toLocaleString()}</dd></div>
      <div><dt>Facility reference</dt><dd className="qa-wrap">{item.decision.case.facilityId}</dd></div>
    </dl>
    <h3>Moderator justification</h3><p className="qa-wrap">{item.decision.reason}</p>
    <h3>Original form and policy tags</h3>
    {Object.keys(item.decision.answers).length ? <dl className="qa-facts">{Object.entries(item.decision.answers).map(([key, answer]) =>
      <div key={key}><dt>{labels.get(key) ?? key}</dt><dd className="qa-wrap">{typeof answer === "string" ? answer : JSON.stringify(answer)}</dd></div>)}</dl>
      : <p>No saved form answers.</p>}
    {snapshot?.reviewPolicy && <details><summary>Original policy guidance</summary><p className="qa-wrap">{snapshot.reviewPolicy}</p></details>}
    {pinned && <>
      <p>Selected policy tags · {(item.decision.policyTags ?? []).map((id) =>
        pinned.document.tags.find((tag) => tag.id === id)?.label ?? id).join(", ") || "None"}</p>
      <PinnedPolicyReference policy={pinned} historical />
    </>}
    {item.currentPolicyId !== undefined && item.currentPolicyId !== (pinned?.id ?? null) && <p className="qa-notice">
      Current queue policy differs. Assess this case using the original policy shown here.
    </p>}
    <h3>Evidence at submission</h3>
    {!snapshot && <p className="qa-notice">This older decision has citation IDs but no historical evidence snapshot.</p>}
    {snapshot?.truncated && <p className="qa-notice">The saved evidence snapshot is incomplete.</p>}
    {snapshot?.evidence.length ? <ul className="qa-records">{snapshot.evidence.map((entry) => <li key={entry.id}>
      <strong>{optionalLabel(entry.finding)}</strong> <span className="qa-muted">{optionalLabel(entry.source)} · {entry.cited ? "Cited" : "Available"}</span>
      <p className="qa-wrap">{entry.reference}</p>
      <small>Evidence expiration <time dateTime={entry.expiresAt}>{new Date(entry.expiresAt).toLocaleDateString()}</time></small>
    </li>)}</ul> : <p>{item.decision.evidenceIds.length ? item.decision.evidenceIds.join(", ") : "No independent evidence recorded."}</p>}
    <p className="qa-muted">Original publication · {snapshot?.publication ? optionalLabel(snapshot.publication) : "No verification recorded in this snapshot"}</p>
    <h3>Current case context</h3><p>{optionalLabel(item.decision.case.status)}</p>
    <details><summary>Current independent evidence</summary>
      {item.currentEvidence.length ? <ul className="qa-records">{item.currentEvidence.map((entry) =>
        <li key={entry.id}><strong>{optionalLabel(entry.finding)}</strong><p className="qa-wrap">{entry.reference}</p></li>)}</ul>
        : <p>No current independent evidence available.</p>}</details>
  </section>;
}

type Draft = { outcome: "" | "PASS" | "FAIL"; notes: string; category: string; severity: string; policyReference: string; proposedAction: string };
const draftSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("PASS"), notes: text.optional() }),
  z.object({ outcome: z.literal("FAIL"), notes: text, category: z.enum(categories), severity: z.enum(severities),
    policyReference: z.string().trim().min(3).max(240), proposedAction: z.enum(["APPROVE","REJECT","ESCALATE"]).optional() }),
]);
export function QaAssessmentForm({ item, action }: { item: ReviewDetail; action: Action }) {
  const form = useForm<Draft>({ defaultValues: {
    outcome: "", notes: "", category: "", severity: "", policyReference: "", proposedAction: "",
  } });
  const fail = form.watch("outcome") === "FAIL";
  const errors = form.formState.errors;
  const error = (field: keyof Draft) => errors[field] &&
    <p id={"qa-error-" + field} className="qa-error" role="alert">{errors[field]?.message}</p>;
  const fieldError = (field: keyof Draft) => ({
    "aria-invalid": Boolean(errors[field]), "aria-describedby": errors[field] ? "qa-error-" + field : undefined,
  });
  return <form className="qa-form" noValidate onSubmit={form.handleSubmit(async (input) => {
    form.clearErrors();
    const result = draftSchema.safeParse({ ...input, notes: input.notes.trim() || undefined, proposedAction: input.proposedAction || undefined });
    if (!result.success) {
      result.error.issues.forEach(({ path }) => {
        const field = String(path[0]) as keyof Draft;
        form.setError(field, { message: field === "outcome" ? "Choose Pass or Fail." : "Enter a valid " +
          ({ notes: "explanation", policyReference: "policy reference", category: "error category", severity: "severity" }[field as "notes"] ?? "value") + "." });
      });
      return;
    }
    await action.perform("/qa/reviews/" + item.id + "/submit", {
      version: item.assignmentVersion, assessment: result.data,
    }, "QA assessment recorded.");
  })}>
    <fieldset className="qa-fieldset" disabled={action.pending}>
      <legend>QA outcome</legend>
      <div className="qa-actions">
        <label className="qa-check"><input type="radio" value="PASS" {...form.register("outcome")} {...fieldError("outcome")} /> QA Pass</label>
        <label className="qa-check"><input type="radio" value="FAIL" {...form.register("outcome")} {...fieldError("outcome")} /> QA Fail</label>
      </div>{error("outcome")}
      {fail && <>
        <label>Error category<select {...form.register("category")} {...fieldError("category")} required>
          <option value="">Select category</option>{categories.map((value) => <option key={value} value={value}>{optionalLabel(value)}</option>)}
        </select></label>{error("category")}
        <label>Severity<select {...form.register("severity")} {...fieldError("severity")} required>
          <option value="">Select severity</option>{severities.map((value) => <option key={value} value={value}>{optionalLabel(value)}</option>)}
        </select></label>{error("severity")}
        <label>Policy reference<input {...form.register("policyReference")} {...fieldError("policyReference")} maxLength={240} required /></label>{error("policyReference")}
        <label>Proposed outcome<select {...form.register("proposedAction")}><option value="">Optional</option>
          {["APPROVE","REJECT","ESCALATE"].map((value) => <option key={value} value={value}>{optionalLabel(value)}</option>)}</select></label>
      </>}
      <label>{fail ? "Explanation" : "Assessment notes"}<textarea {...form.register("notes")} {...fieldError("notes")} rows={3} maxLength={500} required={fail} /></label>{error("notes")}
      <div className="qa-actions"><button className="wf-primary" type="submit">{action.pending ? "Saving…" : "Submit QA assessment"}</button></div>
    </fieldset>
  </form>;
}

function QaDispute({ item, action }: { item: ReviewDetail; action: Action }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <section className="wf-panel qa-panel"><h2>Dispute and adjudication</h2>
    {item.dispute ? <>
      <p>{optionalLabel(item.dispute.status)} · {item.dispute.reason}</p>
      {item.dispute.resolution && <p className="qa-wrap">{item.dispute.resolution}</p>}
      {item.capabilities.adjudicate && ["OPEN","UNDER_REVIEW"].includes(item.dispute.status) &&
        <form className="qa-form" onSubmit={(event) => {
          event.preventDefault(); const data = new FormData(event.currentTarget);
          void action.perform("/qa/disputes/" + item.dispute!.id + "/adjudicate",
            { action: String(data.get("action")), reason: String(data.get("reason")) });
        }}>
          <label>Adjudication<select name="action" required defaultValue="UPHOLD">
            <option value="UPHOLD">Uphold result</option><option value="OVERTURN">Overturn result</option>
            {item.dispute.status === "OPEN" && <option value="REQUEST_REVIEW">Request additional review</option>}</select></label>
          <label>Adjudication reason<textarea name="reason" minLength={3} maxLength={500} required rows={2} /></label>
          <button type="submit" disabled={action.pending}>Record adjudication</button>
        </form>}
    </> : item.capabilities.dispute && item.assessment?.finalOutcome === "FAIL" && !item.correction?.approvedAt ? <>
      <button type="button" onClick={() => dialog.current?.showModal()}>Open dispute</button>
      <dialog ref={dialog} className="qa-dialog" aria-labelledby="qa-dispute-heading"><h2 id="qa-dispute-heading">Dispute this QA result</h2>
        <form className="qa-form" onSubmit={(event) => {
          event.preventDefault();
          void action.perform("/qa/reviews/" + item.id + "/disputes", {
            reason: String(new FormData(event.currentTarget).get("reason")),
          }, "Dispute opened.", () => dialog.current?.close());
        }}>
          <label>Dispute reason<textarea name="reason" required minLength={3} maxLength={500} rows={3} autoFocus /></label>
          {action.error && <p role="alert">{action.error}</p>}
          <div className="qa-actions"><button type="button" onClick={() => dialog.current?.close()}>Cancel</button>
            <button type="submit" disabled={action.pending}>Submit dispute</button></div>
        </form></dialog>
      </> : <p>No dispute has been filed.</p>}
  </section>;
}

function QaCorrection({ item, action, actor }: { item: ReviewDetail; action: Action; actor: Actor }) {
  const [decision, setDecision] = useState(item.assessment?.proposedAction ?? "REJECT");
  const row = item.correction;
  return <section className="wf-panel qa-panel"><h2>Correction</h2>
    <p className="qa-muted">The current decision stays effective until an authorized correction commits.</p>
    {row ? <>
      <p>{optionalLabel(row.action)} · {row.reason}</p>
      {row.approvedAt ? <p role="status">Correction committed · {row.handlingSeconds ?? 0}s correction handling</p>
        : item.assessment?.finalOutcome === "FAIL" && item.capabilities.adjudicate && <div className="qa-actions">
          <button type="button" disabled={action.pending} onClick={() => void action.perform("/qa/corrections/" + row.id + "/start")}>Start correction</button>
          {row.reviewerId === actor.userId && row.leaseUntil && Date.parse(row.leaseUntil) > Date.now() &&
            <button type="button" className="wf-primary" disabled={action.pending} onClick={() =>
              void action.perform("/qa/corrections/" + row.id + "/approve", {}, "Correction committed.")}>Approve correction</button>}
        </div>}
    </> : item.capabilities.recommend && item.assessment?.finalOutcome === "FAIL" ? <form className="qa-form" onSubmit={(event) => {
      event.preventDefault(); const form = new FormData(event.currentTarget);
      void action.perform("/qa/reviews/" + item.id + "/corrections", {
        action: decision, reason: String(form.get("reason")), evidenceIds: form.getAll("evidence"),
      }, "Correction recommended.");
    }}>
      <label>Corrected outcome<select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)}>
        <option value="REJECT">Reject</option><option value="APPROVE">Approve with independent evidence</option>
        <option value="ESCALATE">Escalate</option></select></label>
      {decision === "APPROVE" && <fieldset className="qa-fieldset"><legend>Cite current independent evidence</legend>
        {item.currentEvidence.length ? item.currentEvidence.map((entry) => <label key={entry.id} className="qa-check">
          <input type="checkbox" name="evidence" value={entry.id} />{optionalLabel(entry.finding)} · {optionalLabel(entry.source)}</label>)
          : <p>Current independent evidence is unavailable.</p>}
      </fieldset>}
      <label>Correction reason<textarea rows={2} name="reason" required minLength={3} maxLength={500} /></label>
      <button type="submit" disabled={action.pending}>Recommend correction</button>
    </form> : <p>No correction has been requested.</p>}
  </section>;
}

export function QaReviewWorkspace({ actor, id }: { actor: Actor; id: string }) {
  const response = useQa<ReviewDetail>(actor, "/qa/reviews/" + id);
  const action = useQaAction();
  const nav = useNavigate();
  const item = response.data;
  if (response.isPending) return <p role="status">Loading review…</p>;
  if (!item) return <p role="alert">{errorText(response.error)}</p>;
  return <>
    <Link to="/qa" className="qa-back">Back to QA worklist</Link>
    <div className="qa-heading">
      <div><h1>QA review · {item.decision.case.code}</h1><p className="qa-muted qa-wrap">Review {item.id}</p></div>
      <span className="wf-badge">{optionalLabel(item.status)}</span>
    </div>
    <dl className="wf-panel qa-facts">
      <div><dt>Queue</dt><dd>{item.queue.name}</dd></div><div><dt>Original moderator</dt><dd>{item.moderator.name}</dd></div>
      <div><dt>Assigned auditor</dt><dd>{item.assignee?.name ?? "Unassigned"}</dd></div>
      <div><dt>Sampling policy</dt><dd>{item.policy ? "Version " + item.policy.version + " · " + item.policy.rate / 100 + "%" : "Manual or unavailable"}</dd></div>
    </dl>
    {action.error && <p className="qa-error" role="alert">{action.error}</p>}
    {action.message && <p role="status">{action.message}</p>}
    <div className="qa-grid">
      <div className="qa-column">
        <OriginalDecisionPanel item={item} />
        <section className="wf-panel qa-panel"><h2>Audit history</h2>
          <ol className="qa-records">{item.history.map((event) => <li key={event.id}>
            <strong>{optionalLabel(event.action.replace(/^QA_/, ""))}</strong>
            <small>{new Date(event.createdAt).toLocaleString()} · {event.actorName ?? optionalLabel(event.actorType)}</small>
          </li>)}</ol>
        </section>
      </div>
      <div className="qa-column">
        <section className="wf-panel qa-panel">
          <h2>QA assessment</h2>
          {item.assessment ? <dl className="qa-facts">
            <div><dt>Auditor result</dt><dd>{optionalLabel(item.assessment.originalOutcome)} · {item.assessment.originalScore}</dd></div>
            <div><dt>Finalized result</dt><dd>{optionalLabel(item.assessment.finalOutcome)}{item.assessment.finalScore != null ? " · " + item.assessment.finalScore : ""}</dd></div>
            <div><dt>Handling time</dt><dd>{item.assessment.handlingSeconds}s</dd></div>
            {item.assessment.category && <div><dt>Error category</dt><dd>{optionalLabel(item.assessment.category)} · {optionalLabel(item.assessment.severity)}</dd></div>}
            {item.assessment.policyReference && <div><dt>Policy reference</dt><dd>{item.assessment.policyReference}</dd></div>}
            {item.assessment.notes && <div><dt>Explanation</dt><dd className="qa-wrap">{item.assessment.notes}</dd></div>}
          </dl> : item.capabilities.assess && item.status === "IN_REVIEW" ? <QaAssessmentForm item={item} action={action} /> :
            item.capabilities.assess ? <button type="button" className="wf-primary" disabled={action.pending} onClick={() =>
              void action.perform("/qa/reviews/" + id + "/start", { version: item.assignmentVersion }, "Review started.")}>Start review</button>
              : <p>Awaiting an authorized assessment.</p>}
          {item.capabilities.assess && <div className="qa-actions"><button type="button" disabled={action.pending} onClick={() =>
            void action.perform("/qa/reviews/" + id + "/release", { version: item.assignmentVersion }, "Review released.", () => nav("/qa"))}>Release review</button></div>}
          {item.capabilities.assign && !item.assessment && item.eligibleAuditors.length > 0 &&
            <form className="qa-form" onSubmit={(event) => {
              event.preventDefault();
              void action.perform("/qa/reviews/" + id + "/assign", {
                version: item.assignmentVersion, auditorId: new FormData(event.currentTarget).get("auditor"),
              }, "QA assignment saved.");
            }}>
              <label>Assign auditor<select name="auditor" required defaultValue={item.assignedTo ?? ""}>
                <option value="">Select auditor</option>{item.eligibleAuditors.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select></label><button type="submit" disabled={action.pending}>Save assignment</button>
            </form>}
        </section>
        <QaDispute item={item} action={action} />
        <QaCorrection item={item} action={action} actor={actor} />
      </div>
    </div>
  </>;
}
