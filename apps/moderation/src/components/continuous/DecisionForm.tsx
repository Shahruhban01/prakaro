import { useState } from "react";
import { useForm } from "react-hook-form";
import { BookOpen, ClipboardCheck, Search, X } from "lucide-react";
import type { Question } from "../../api";
import { label, validateDecision, type Decision, type Evidence } from "./workspaceContract";
import { actions, fieldVisible, policyAnswers, validatePolicyDecision, type PinnedPolicy } from "../policy/policyApi";
import { PinnedPolicyReference } from "../policy/PolicyReference";
import { DynamicField, DynamicTags } from "../policy/DynamicReview";

type Draft = { action: string; reason: string; evidenceIds: string[]; answers: Record<string, unknown>; tagIds: string[] };
type Policy = { form: Question[]; version?: number; reviewPolicy?: string; pinned?: PinnedPolicy };

function PolicyTags({ item, value, set, focusTarget }: {
  item: Question; value: unknown; set: (value: string) => void; focusTarget: boolean;
}) {
  const [search, setSearch] = useState("");
  const choices = item.options.filter((option) => option.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <div className="mw-tags">
    {typeof value === "string" && value && <button type="button" className="mw-chip"
      aria-label={`Remove ${value}`} onClick={() => set("")}>{value} <X size={14} /></button>}
    <label className="mw-tag-search"><Search size={15} /><span className="sr-only">Search {item.label}</span>
      <input id={focusTarget ? "mw-tag-search" : undefined} type="search" value={search}
        onChange={(event) => setSearch(event.target.value)} placeholder="Search tags" />
    </label>
    <div className="mw-tag-options">
      {choices.map((option) => <button key={option} type="button" className="mw-chip"
        aria-pressed={value === option} onClick={() => set(option)}>{option}</button>)}
      {!choices.length && <p className="mw-muted">No matching tags.</p>}
    </div>
  </div>;
}

export function PolicyReference({ policy }: { policy: Policy | null }) {
  const [search, setSearch] = useState("");
  const sections = policy?.reviewPolicy?.split(/\n\s*\n/).filter(Boolean) ?? [];
  const results = sections.filter((section) => section.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <details className="mw-panel mw-policy" id="mw-policy-reference">
    <summary className="mw-panel-heading"><BookOpen size={17} /><strong>Review policy</strong>
      {policy?.version !== undefined && <span className="mw-pill">Version {policy.version}</span>}
    </summary>
    <div className="mw-body mw-policy-content">
      {!sections.length ? <p className="mw-muted">No policy reference was saved with this task.</p> : <>
        <label>Search policy <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        {results.length ? results.map((section, index) => <p key={index}>{section}</p>) :
          <p className="mw-muted">No matching policy sections.</p>}
      </>}
    </div>
  </details>;
}

function ReviewField({ item, value, set, evidence, focusTarget, invalid }: {
  item: Question; value: unknown; set: (value: unknown) => void; evidence: Evidence[];
  focusTarget: boolean; invalid: boolean;
}) {
  const id = "mw-field-" + item.key;
  const described = invalid ? id + "-help" : undefined;
  const text = typeof value === "string" ? value : "";
  if (item.type === "REASON" && item.options.length) {
    return <PolicyTags item={item} value={value} set={set} focusTarget={focusTarget} />;
  }
  if (item.type === "MULTI") {
    const current = Array.isArray(value) ? value : [];
    return <div className="mw-checkboxes">{item.options.map((option) => <label key={option}>
      <input type="checkbox" checked={current.includes(option)} aria-describedby={described}
        onChange={(event) => set(event.target.checked ? [...current, option] : current.filter((choice) => choice !== option))} />
      {option}
    </label>)}</div>;
  }
  if (["SELECT", "BOOLEAN", "EVIDENCE"].includes(item.type)) {
    const options = item.type === "BOOLEAN" ? ["YES", "NO", "UNKNOWN"] :
      item.type === "EVIDENCE" ? evidence.map(({ id }) => id) : item.options;
    return <select id={id} value={text} aria-describedby={described} aria-invalid={invalid}
      required={item.required} onChange={(event) => set(event.target.value)}>
      <option value="">Choose an option</option>
      {options.map((option) => <option key={option} value={option}>{item.type === "EVIDENCE"
        ? label(evidence.find(({ id }) => id === option)?.finding ?? option) : label(option)}</option>)}
    </select>;
  }
  if (item.type === "NOTES") return <textarea id={id} rows={3} maxLength={1000} value={text}
    aria-describedby={described} aria-invalid={invalid} onChange={(event) => set(event.target.value)} />;
  const type = item.type === "NUMBER" ? "number" : item.type === "DATE" ? "date" : "text";
  return <input id={id} type={type} value={type === "number" && typeof value === "number" ? value : text}
    aria-describedby={described} aria-invalid={invalid} required={item.required} maxLength={1000}
    onChange={(event) => set(type === "number" && event.target.value ? event.target.valueAsNumber : event.target.value)} />;
}

export function DecisionForm({ policy, evidence, frozen, context, children, clarification, hasReporterExplanation = false }: {
  policy: Policy | null; evidence: Evidence[]; frozen: boolean; context: React.ReactNode; children: (decision: Decision | null) => React.ReactNode;
  clarification?: React.ReactNode; hasReporterExplanation?: boolean;
}) {
  const pinned = policy?.pinned;
  const document = pinned?.document;
  const { register, watch, setValue } = useForm<Draft>({
    defaultValues: { action: "", reason: "", evidenceIds: [], tagIds: [], answers: Object.fromEntries(
      (document?.fields ?? []).filter(({ defaultValue }) => defaultValue !== undefined).map(({ id, defaultValue }) => [id, defaultValue]),
    ) },
  });
  const draft = watch();
  const { visible, errors, decision } = validateDecision({ action: draft.action, reason: draft.reason, evidenceIds: draft.evidenceIds,
    answers: document ? {} : draft.answers }, policy?.form ?? [], evidence);
  const selected = evidence.filter(({ id }) => draft.evidenceIds.includes(id));
  const action = actions.safeParse(draft.action);
  const dynamic = document ? policyAnswers(document, draft.answers) : undefined;
  const tags = document && dynamic && action.success ? document.tags.filter((item) =>
    item.actions.includes(action.data) && fieldVisible(item.when, dynamic.answers)) : [];
  const tagIds = draft.tagIds.filter((id) => tags.some((item) => item.id === id));
  const policyErrors = document && dynamic && action.success ? validatePolicyDecision(document, action.data, dynamic.answers,
    tagIds, selected.filter((item) => ["PRAKARO_AUDIT","PARKING_OPERATOR","PUBLIC_AUTHORITY"].includes(item.source))
      .map(({ id }) => id), hasReporterExplanation) : {};
  const submitted = decision && pinned && dynamic
    ? Object.keys(policyErrors).length ? null : { ...decision, answers: dynamic.answers, policyVersionId: pinned.id, tagIds }
    : decision;
  const firstTag = visible.find(({ type, options }) => type === "REASON" && options.length);
  return <>
    <div className="mw-grid">
      {context}
      <div className="mw-case-details">
      {pinned ? <PinnedPolicyReference policy={pinned} /> : <PolicyReference policy={policy} />}
      {clarification}
    <section className="mw-panel" aria-labelledby="decision-heading">
      <div className="mw-panel-heading"><ClipboardCheck size={18} /><h2 id="decision-heading">Review decision</h2></div>
      <form className="mw-body mw-form" onSubmit={(event) => event.preventDefault()}>
        <fieldset className="mw-fields" disabled={frozen}>
          <div>
            <label htmlFor="action-select">Decision <span>Required</span></label>
            <select id="action-select" {...register("action")} required aria-describedby="mw-decision-help">
              <option value="">Choose a decision</option>
              <option value="APPROVE">Approve and publish verification</option>
              <option value="REJECT">Reject the case</option>
              <option value="ESCALATE">Escalate for supervisor review</option>
            </select>
            <p id="mw-decision-help" className="mw-muted">{draft.action === "APPROVE"
              ? "Approval publishes parking verification supported by current independent evidence."
              : draft.action === "REJECT" ? "Rejection closes this case. Listings remain visible."
              : draft.action === "ESCALATE" ? "Escalation records the reason for a supervisor."
              : "Choose the outcome supported by this case."}</p>
          </div>
          <fieldset className="mw-field-group">
            <legend>Evidence cited</legend>
            {evidence.length ? <div className="mw-checkboxes">{evidence.map((item) => <label key={item.id}>
              <input type="checkbox" checked={draft.evidenceIds.includes(item.id)}
                aria-describedby={errors.has("evidenceIds") ? "mw-evidence-error" : undefined}
                onChange={(event) => setValue("evidenceIds", event.target.checked
                  ? [...draft.evidenceIds, item.id] : draft.evidenceIds.filter((id) => id !== item.id))} />
              {label(item.finding)} · {label(item.source)}
            </label>)}</div> : <p className="mw-muted">No current independent evidence is available to cite.</p>}
            {!!draft.evidenceIds.filter((id) => !selected.some((item) => item.id === id)).length &&
              <button type="button" onClick={() => setValue("evidenceIds", selected.map(({ id }) => id))}>Remove unavailable evidence</button>}
            {errors.has("evidenceIds") && <p id="mw-evidence-error" className="mw-error">{errors.get("evidenceIds")}</p>}
            {policyErrors.evidenceIds && <p className="mw-error">{policyErrors.evidenceIds}</p>}
          </fieldset>
          {!policy && <p role="alert" className="mw-error">The case’s versioned review form is unavailable.</p>}
          {dynamic?.visible.map((field) => <DynamicField key={field.id} field={field} value={draft.answers[field.id]}
            evidence={selected} error={policyErrors[field.id]}
            set={(value) => setValue("answers", { ...draft.answers, [field.id]: value })} />)}
          {pinned && <DynamicTags available={tags} selected={tagIds} error={policyErrors.tags} set={(values) =>
            setValue("tagIds", [...draft.tagIds.filter((id) => !tags.some((tag) => tag.id === id)), ...values])} />}
          {visible.map((item) => <fieldset key={item.key} className="mw-field-group">
            <legend>{item.label} {item.required && <span>Required</span>}</legend>
            <label className="sr-only" htmlFor={"mw-field-" + item.key}>{item.label}</label>
            <ReviewField item={item} value={draft.answers[item.key]} focusTarget={firstTag?.key === item.key}
              evidence={selected} invalid={errors.has(item.key)}
              set={(value) => setValue("answers", { ...draft.answers, [item.key]: value })} />
            {errors.has(item.key) && <p id={`mw-field-${item.key}-help`} className="mw-error">{errors.get(item.key)}</p>}
          </fieldset>)}
          <div>
            <label htmlFor="reason-input">Decision justification <span>Required</span></label>
            <textarea id="reason-input" rows={4} maxLength={500} required {...register("reason")}
              aria-describedby="mw-reason-help" placeholder="Record the evidence or uncertainty behind your decision." />
            <p id="mw-reason-help" className="mw-muted">{draft.reason.trim().length < 3 ? "At least 3 characters. " : ""}{draft.reason.length}/500</p>
          </div>
        </fieldset>
      </form>
    </section>
    </div>
    </div>
    {children(policy ? submitted : null)}
  </>;
}
