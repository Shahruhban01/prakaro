import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock3, LockKeyhole, Radio, ShieldAlert } from "lucide-react";
import type { Queue } from "../../api";
import type { AuxSnapshot } from "../../attendanceApi";
import { CaseEvidencePanel } from "./CaseEvidencePanel";
import { DecisionForm } from "./DecisionForm";
import { useModerateWorkspace } from "./useModerateWorkspace";
import { label, policyFor } from "./workspaceContract";
import { reporterExplanation } from "../policy/policyApi";
import { CaseClarification } from "../policy/Clarifications";
import "./workspace.css";

function ReleaseConfirmation({ disabled, leave }: { disabled: boolean; leave: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [releasing, setReleasing] = useState(false);
  return <>
    <button type="button" className="mw-release" disabled={disabled} onClick={() => dialog.current?.showModal()}>
      Release &amp; Leave
    </button>
    <dialog ref={dialog} className="mw-dialog" aria-labelledby="release-title"
      aria-describedby="release-description" onCancel={(event) => { if (releasing) event.preventDefault(); }}>
      <h2 id="release-title">Release this case?</h2>
      <p id="release-description">The case will be released and may return to the pending queue.
        This attempt adds zero to your completed count. No decision will be published.</p>
      <div className="mw-actions">
        <button type="button" autoFocus disabled={releasing} onClick={() => dialog.current?.close()}>Keep reviewing</button>
        <button type="button" disabled={releasing || disabled} onClick={async () => {
          setReleasing(true);
          await leave();
          dialog.current?.close();
          setReleasing(false);
        }}>{releasing ? "Releasing…" : "Release and leave"}</button>
      </div>
    </dialog>
  </>;
}

function useWorkspaceShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    function shortcut(event: KeyboardEvent) {
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey || event.repeat ||
        (event.target instanceof HTMLElement &&
         event.target.closest("input,textarea,select,[contenteditable],[role=dialog]")) ||
        document.querySelector("dialog[open],[role=dialog][data-state=open]")) return;
      const key = event.code;
      const target = key === "KeyD" ? "action-select" : key === "KeyT" ? "mw-tag-search" :
        key === "KeyS" ? "mw-submit" : key === "KeyP" ? "mw-policy-reference" : undefined;
      if (!target) return;
      const element = document.getElementById(target);
      if (!element) return;
      event.preventDefault();
      if (element instanceof HTMLDetailsElement) {
        element.open = true;
        element.querySelector("summary")?.focus();
      } else element.focus();
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [enabled]);
}

export function ModerateWorkspace({ queue, aux, actorId, hasPendingCases = false }: {
  queue: Queue; aux?: AuxSnapshot; actorId?: string; hasPendingCases?: boolean;
}) {
  const work = useModerateWorkspace(queue.id, actorId);
  const {
    session, reservation, remaining, serverNow, expired, operation, problem,
    online, reconnecting, notice, retryDecision,
  } = work;
  const title = useRef<HTMLHeadingElement>(null);
  const reservationId = reservation?.id;
  useEffect(() => { if (reservationId) title.current?.focus(); }, [reservationId]);
  useWorkspaceShortcuts(Boolean(reservation) && !operation);

  const busy = Boolean(operation);
  const hidden = ["access", "session", "queue"].includes(problem?.kind ?? "");
  const auxReady = aux?.state === "MODERATING" && aux.presence === "ONLINE";
  const submitting = operation === "submit" || operation === "submit-leave";
  const status = !online ? "Disconnected" : reconnecting || operation === "restore" ? "Reconnecting" :
    problem?.kind === "connection" ? "Connection interrupted" : "Connected";
  const leaseStatus = expired ? "Lease expired" : remaining <= 60 ? "Lease expiring" : "Lease active";
  const duration = reservation ? Math.max(0, Math.floor((Math.min(serverNow, Date.parse(reservation.leaseExpiresAt)) - Date.parse(reservation.reservedAt)) / 1000)) : 0;
  const banners = <>
    <div role="status" className="mw-announcement">{submitting ? "Saving decision…" :
      operation === "next" ? "Loading next case…" : notice}</div>
    {problem && <div className="mw-alert" role="alert"><ShieldAlert size={18} />
      <div><strong>{({
        access: "Access revoked", session: "Session unavailable", queue: "Queue unavailable",
        connection: "Connection interrupted", lease: "Lease expired", submission: "Request failed",
      })[problem.kind]}</strong><p>{problem.message}</p></div>
    </div>}
    {!online && <div className="mw-alert" role="status">Disconnected. Your draft is kept on this page.</div>}
    {expired && problem?.kind !== "lease" && <div className="mw-alert" role="status">
      The case lease expired. Restore the session or request another case.
    </div>}
    {(problem || expired) && <div className="mw-recover mw-actions">
      <button type="button" disabled={busy || !online} onClick={work.restore}>Restore session</button>
      {expired && session && !hidden && <button type="button" disabled={busy || !online}
        onClick={work.next}>Request another case</button>}
    </div>}
  </>;

  if (reservation && session) {
    const policy = policyFor(reservation);
    const evidence = (reservation.case.admission?.facility?.evidence ?? []).filter(
      (item) => item.approvedAt && Date.parse(item.approvedAt) <= serverNow && Date.parse(item.expiresAt) > serverNow,
    );
    const canSubmit = online && !busy && !expired && !hidden && !reconnecting;
    return <div className="mw-workspace">
      <section className="mw-case-header" aria-labelledby="case-heading">
        <div>
          <p className="mw-overline">{queue.name}</p>
          <h1 id="case-heading" ref={title} tabIndex={-1}>{hidden ? "Moderation workspace" : reservation.case.code}</h1>
          {!hidden && <p className="mw-muted">{label(reservation.case.category)}</p>}
        </div>
        <div className="mw-header-metrics">
          <div className="mw-handling"><span><Clock3 size={15} /> Case handling</span>
            <strong role="timer" aria-label="Case handling seconds" data-testid="case-timer">{duration}s</strong>
          </div>
          <div><span>Session Completed: <strong>{session.casesCompleted}</strong></span>
            <span className="mw-pill">{hidden ? "Unavailable" : reservation.case.status?.replaceAll("_", " ") || "Status unavailable"}</span>
          </div>
          <div><span><Radio size={15} /> {status}</span>
            <span className={expired || remaining <= 60 ? "mw-lease-warning" : ""}><LockKeyhole size={14} /> {leaseStatus}</span>
          </div>
        </div>
      </section>
      {banners}
      <div hidden={hidden}>
        <DecisionForm key={reservation.id} policy={policy} evidence={evidence} frozen={busy || expired || Boolean(retryDecision)}
          clarification={policy?.pinned && <CaseClarification reservationId={reservation.id} expired={expired} />}
          hasReporterExplanation={reservation.case.trigger === "REPORT" && reporterExplanation(reservation.case.metadata)}
          context={<CaseEvidencePanel reservation={reservation} serverNow={serverNow} />}>
          {(decision) => <footer className="mw-action-bar" aria-label="Moderation actions">
            <ReleaseConfirmation disabled={busy || !online || Boolean(retryDecision)} leave={work.leave} />
            <div className="mw-actions mw-submit-buttons">
              <button type="button" disabled={!canSubmit || (!decision && !retryDecision) ||
                retryDecision?.andLeave === false}
                onClick={() => { const value = retryDecision?.decision ?? decision; if (value) void work.submit(value, true); }}>
                {operation === "submit-leave" ? "Saving…" : "Submit & Leave"}
              </button>
              <button type="button" className="mw-primary" id="mw-submit"
                disabled={!canSubmit || (!decision && !retryDecision) || retryDecision?.andLeave === true}
                onClick={() => { const value = retryDecision?.decision ?? decision; if (value) void work.submit(value, false); }}>
                {operation === "submit" ? "Saving…" : "Submit → Next"} <ArrowRight size={16} />
              </button>
            </div>
          </footer>}
        </DecisionForm>
        <details className="mw-shortcuts">
          <summary>Keyboard shortcuts</summary>
          <p>Alt + Shift + D focuses the decision. T focuses tag search. P opens the policy. S focuses Submit → Next.</p>
        </details>
      </div>
      {hidden && <Link to="/my-queues" className="wf-breadcrumb">Back to subscribed queues</Link>}
    </div>;
  }

  return <div className="mw-workspace">
    <section className="mw-panel">
      <div className="mw-panel-heading"><h1>{queue.name}</h1></div>
      <div className="mw-body mw-state">
        {work.connecting || operation === "start" ? <p role="status">
          {operation === "start" ? "Loading case…" : "Connecting to moderation…"}
        </p> : session ? <>
          <h2>{expired ? "Case lease expired" : "No pending cases are currently available."}</h2>
          <p>Session Completed: <strong>{session.casesCompleted}</strong></p>
          <div className="mw-actions">
            {!expired && <button type="button" disabled={busy || !online || hidden} onClick={work.next}>Retry</button>}
            <button type="button" disabled={busy || !online} onClick={work.leave}>Leave Session</button>
          </div>
        </> : <>
          <h2>Continuous moderation</h2>
          <p>{auxReady ? (hasPendingCases ? "Your AUX is ready." : "Your AUX is ready. No pending cases in queue.")
            : "Punch Moderating in the header to start a session."}</p>
          <div className="mw-actions">
            <button className="mw-primary" type="button" disabled={busy || !online || !auxReady || !hasPendingCases || !!problem}
              onClick={work.start}>Start moderation</button>
            <Link to={`/queues/${queue.id}/cases`}>View cases</Link>
          </div>
        </>}
      </div>
    </section>
    {banners}
  </div>;
}
