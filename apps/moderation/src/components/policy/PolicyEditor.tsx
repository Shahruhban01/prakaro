import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { PolicyContents } from "./PolicyReference";
import { actions, evidenceKind, policyDocument, readable, usePolicyAction, type PolicyAction,
  type PolicyDocument, type PolicyField, type VersionHeader } from "./policyApi";

export type EditableVersion = VersionHeader & { document: PolicyDocument };
type Condition = PolicyField["when"];
type Tag = PolicyDocument["tags"][number];
type Rule = PolicyDocument["evidence"][number];
const types = ["SHORT_TEXT","LONG_TEXT","SELECT","MULTI","CHECKBOX","RADIO","NUMBER","DATE","EVIDENCE"] as const;
const decisions = actions.options;
const supportedRequired = ["INDEPENDENT_VERIFICATION","REPORTER_EXPLANATION"];
const newId = (kind: string) => kind + "_" + crypto.randomUUID().slice(0, 8);
const techniques = ["Content","Tags","Review form","Evidence requirements","Preview"] as const;

function Rows({ title, add, children }: { title: string; add: () => void; children: React.ReactNode }) {
  return <section className="policy-stack"><div className="policy-title"><h3>{title}</h3>
    <button type="button" onClick={add}>Add {title}</button></div>{children}</section>;
}
function Entry({ title, index, size, remove, move, children, issues = [] }: {
  title: string; index: number; size: number; remove: () => void; move: (delta: number) => void; children: React.ReactNode; issues?: Issue[];
}) {
  return <fieldset className="policy-entry">
    <legend>{title}</legend>
    <div className="policy-field-grid">{children}</div>
    {issues.length > 0 && <ul className="policy-field-errors">{issues.map((issue, i) => <li key={i}>
      {issue.path.slice(2).join(" › ") || title} · {issue.message}</li>)}</ul>}
    <div className="policy-actions">
      <button type="button" onClick={() => move(-1)} disabled={!index} aria-label={"Move " + title + " up"}>Move up</button>
      <button type="button" onClick={() => move(1)} disabled={index + 1 === size} aria-label={"Move " + title + " down"}>Move down</button>
      <button type="button" onClick={remove} aria-label={"Remove " + title}>Remove</button>
    </div>
  </fieldset>;
}
function reorder<T>(items: T[], index: number, delta: number) {
  const result = items.slice();
  const next = index + delta;
  if (next >= 0 && next < items.length) [result[index], result[next]] = [result[next], result[index]];
  return result;
}
function Values({ label, values, set }: { label: string; values: string[]; set: (values: string[]) => void }) {
  return <label>{label}<textarea rows={3} value={values.join("\n")} onChange={(e) => set(e.target.value.split("\n"))}
    onBlur={() => set(values.map((value) => value.trim()).filter(Boolean))} /></label>;
}
function Choices({ title, options, value, set }: { title: string; options: string[]; value: string[]; set: (next: string[]) => void }) {
  return <fieldset className="policy-choice-group"><legend>{title}</legend>{options.map((item) =>
    <label key={item} className="policy-choice"><input type="checkbox" checked={value.includes(item)} onChange={(event) =>
      set(event.target.checked ? [...value, item] : value.filter((entry) => entry !== item))} />{readable(item)}</label>)}</fieldset>;
}
function When({ fields, value, set }: { fields: PolicyField[]; value: Condition; set: (next: Condition) => void }) {
  const available = fields.filter((field) => !["EVIDENCE","MULTI"].includes(field.type));
  const dependency = available.find((field) => field.id === value?.key);
  return <div className="policy-stack">
    <label>Visible when<select value={value?.key ?? ""} onChange={(e) => {
      const key = e.target.value;
      const field = available.find((item) => item.id === key);
      set(field ? { key, equals: field.type === "CHECKBOX" ? true : field.type === "NUMBER" ? field.min ?? 0 : field.options[0] ?? "" } : undefined);
    }}><option value="">Always</option>{available.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></label>
    {value && dependency && <label>Matching value
      {dependency.type === "CHECKBOX" || dependency.options.length
        ? <select value={String(value.equals)} onChange={(e) => set({ key: value.key, equals: dependency.type === "CHECKBOX" ? e.target.value === "true" : e.target.value })}>
          {(dependency.type === "CHECKBOX" ? ["true","false"] : dependency.options).map((item) => <option key={item} value={item}>{item}</option>)}</select>
        : <input type={dependency.type === "NUMBER" ? "number" : dependency.type === "DATE" ? "date" : "text"}
          value={String(value.equals)} onChange={(e) => set({ key: value.key, equals: dependency.type === "NUMBER" ? Number(e.target.value) : e.target.value })} />}
    </label>}
  </div>;
}
function DefaultValue({ field, set }: { field: PolicyField; set: (next: PolicyField["defaultValue"]) => void }) {
  if (field.type === "EVIDENCE") return null;
  if (field.type === "CHECKBOX") return <label>Default value<select value={field.defaultValue === undefined ? "" : String(field.defaultValue)}
    onChange={(e) => set(e.target.value === "" ? undefined : e.target.value === "true")}>
    <option value="">None</option><option value="true">Checked</option><option value="false">Unchecked</option></select></label>;
  if (field.type === "MULTI") return <Choices title="Default choices" options={field.options.filter(Boolean)}
    value={Array.isArray(field.defaultValue) ? field.defaultValue : []} set={(values) => set(values.length ? values : undefined)} />;
  if (field.options.length && ["SELECT","RADIO"].includes(field.type)) return <label>Default value<select value={String(field.defaultValue ?? "")}
    onChange={(e) => set(e.target.value || undefined)}><option value="">None</option>
    {field.options.filter(Boolean).map((item, i) => <option key={i}>{item}</option>)}</select></label>;
  return <label>Default value<input value={String(field.defaultValue ?? "")} type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
    onChange={(e) => set(e.target.value ? field.type === "NUMBER" ? e.target.valueAsNumber : e.target.value : undefined)} /></label>;
}

function TagEditor({ doc, set, issues }: { doc: PolicyDocument; set: (tags: Tag[]) => void; issues: Issue[] }) {
  return <Rows title="tag" add={() => set([...doc.tags, { id: newId("tag"), label: "New tag", description: "",
    category: "General", severity: "NONE", required: false, actions: decisions, excludes: [], examples: [] }])}>
    {doc.tags.map((tag, i) => {
      const update = (patch: Partial<Tag>) => set(doc.tags.map((row, index) => index === i ? { ...row, ...patch } : row));
      return <Entry key={i} title={"Tag " + (i + 1)} index={i} size={doc.tags.length}
        issues={issues.filter(({ path }) => path[0] === "tags" && path[1] === i)}
        move={(delta) => set(reorder(doc.tags, i, delta))} remove={() => set(doc.tags.filter((_, index) => index !== i))}>
        <label>Tag label<input value={tag.label} onChange={(e) => update({ label: e.target.value })} /></label>
        <label>Tag ID<input value={tag.id} onChange={(e) => update({ id: e.target.value })} /></label>
        <label>Tag category<input value={tag.category} onChange={(e) => update({ category: e.target.value })} /></label>
        <label>Tag severity<select value={tag.severity} onChange={(e) => update({ severity: e.target.value as Tag["severity"] })}>
          {["NONE","MINOR","MAJOR","CRITICAL"].map((item) => <option key={item} value={item}>{readable(item)}</option>)}</select></label>
        <label>Tag guidance<textarea value={tag.description} onChange={(e) => update({ description: e.target.value })} /></label>
        <Values label="Tag examples (one per line)" values={tag.examples} set={(examples) => update({ examples })} />
        <label className="policy-choice"><input type="checkbox" checked={tag.required} onChange={(e) => update({ required: e.target.checked })} />Required tag</label>
        <Choices title="Allowed decisions" options={decisions} value={tag.actions} set={(values) => update({ actions: values as PolicyAction[] })} />
        <When fields={doc.fields} value={tag.when} set={(when) => update({ when })} />
        {!!(doc.tags.length - 1) && <Choices title="Incompatible tags" options={doc.tags.filter((_, index) => index !== i).map(({ id }) => id)}
          value={tag.excludes} set={(excludes) => update({ excludes })} />}
      </Entry>;
    })}
  </Rows>;
}

function FormEditor({ doc, set, issues }: { doc: PolicyDocument; set: (fields: PolicyField[]) => void; issues: Issue[] }) {
  return <Rows title="field" add={() => set([...doc.fields, { id: newId("field"), label: "New field", description: "",
    type: "SHORT_TEXT", required: false, options: [] }])}>
    {doc.fields.map((field, i) => {
      const update = (patch: Partial<PolicyField>) => set(doc.fields.map((row, index) => index === i ? { ...row, ...patch } : row));
      return <Entry key={i} title={"Field " + (i + 1)} index={i} size={doc.fields.length}
        issues={issues.filter(({ path }) => path[0] === "fields" && path[1] === i)}
        move={(delta) => set(reorder(doc.fields, i, delta))} remove={() => set(doc.fields.filter((_, index) => index !== i))}>
        <label>Field label<input value={field.label} onChange={(e) => update({ label: e.target.value })} /></label>
        <label>Field ID<input value={field.id} onChange={(e) => update({ id: e.target.value })} /></label>
        <label>Field type<select value={field.type} onChange={(e) => update({ type: e.target.value as PolicyField["type"],
          options: [], defaultValue: undefined, min: undefined, max: undefined })}>
          {types.map((item) => <option key={item} value={item}>{readable(item)}</option>)}</select></label>
        <label>Field description<textarea value={field.description} onChange={(e) => update({ description: e.target.value })} /></label>
        <label className="policy-choice"><input type="checkbox" checked={field.required} onChange={(e) => update({ required: e.target.checked })} />Required field</label>
        {["SELECT","MULTI","RADIO"].includes(field.type) && <Values label="Options (one per line)" values={field.options}
          set={(options) => update({ options })} />}
        {["NUMBER","SHORT_TEXT","LONG_TEXT","MULTI"].includes(field.type) && <div className="policy-actions">
          <label>Minimum<input type="number" value={field.min ?? ""} onChange={(e) => update({ min: e.target.value ? e.target.valueAsNumber : undefined })} /></label>
          <label>Maximum<input type="number" value={field.max ?? ""} onChange={(e) => update({ max: e.target.value ? e.target.valueAsNumber : undefined })} /></label>
        </div>}
        <DefaultValue field={field} set={(defaultValue) => update({ defaultValue })} />
        <When fields={doc.fields.slice(0, i)} value={field.when} set={(when) => update({ when })} />
      </Entry>;
    })}
  </Rows>;
}

function EvidenceEditor({ doc, set, issues }: { doc: PolicyDocument; set: (rules: Rule[]) => void; issues: Issue[] }) {
  return <Rows title="evidence rule" add={() => set([...doc.evidence, { id: newId("evidence"), label: "Independent verification",
    type: "INDEPENDENT_VERIFICATION", required: true, actions: ["APPROVE"], minimum: 1, tagIds: [] }])}>
    {doc.evidence.map((rule, i) => {
      const update = (patch: Partial<Rule>) => set(doc.evidence.map((row, index) => index === i ? { ...row, ...patch } : row));
      return <Entry key={i} title={"Evidence rule " + (i + 1)} index={i} size={doc.evidence.length}
        issues={issues.filter(({ path }) => path[0] === "evidence" && path[1] === i)}
        move={(delta) => set(reorder(doc.evidence, i, delta))} remove={() => set(doc.evidence.filter((_, index) => index !== i))}>
        <label>Evidence label<input value={rule.label} onChange={(e) => update({ label: e.target.value })} /></label>
        <label>Evidence type<select value={rule.type} onChange={(e) => {
          const type = e.target.value as Rule["type"];
          update({ type, required: supportedRequired.includes(type) && rule.required, minimum: 1 });
        }}>{evidenceKind.options.map((item) => <option key={item} value={item}>{readable(item)}</option>)}</select></label>
        <label className="policy-choice"><input type="checkbox" checked={rule.required} disabled={!supportedRequired.includes(rule.type)}
          onChange={(e) => update({ required: e.target.checked })} />Required evidence</label>
        {!supportedRequired.includes(rule.type) && <p className="policy-muted">Optional guidance until an authorized evidence source is available.</p>}
        <label>Minimum evidence count<input type="number" min="1" max="12" value={rule.minimum} disabled={rule.type === "REPORTER_EXPLANATION"}
          onChange={(e) => update({ minimum: e.target.valueAsNumber })} /></label>
        <Choices title="Apply to decisions" options={decisions} value={rule.actions} set={(values) => update({ actions: values as PolicyAction[] })} />
        <Choices title="Apply when all selected tags are present" options={doc.tags.map(({ id }) => id)}
          value={rule.tagIds} set={(tagIds) => update({ tagIds })} />
        <When fields={doc.fields} value={rule.when} set={(when) => update({ when })} />
      </Entry>;
    })}
  </Rows>;
}

function ContentEditor({ doc, set }: { doc: PolicyDocument; set: (patch: Partial<PolicyDocument>) => void }) {
  return <div className="policy-stack">
    <label>Policy overview<textarea rows={5} maxLength={5000} value={doc.overview} onChange={(e) => set({ overview: e.target.value })} /></label>
    <Rows title="section" add={() => set({ sections: [...doc.sections, { title: "New section", content: "", examples: [], relatedTags: [] }] })}>
      {doc.sections.map((section, i) => {
        const update = (patch: Partial<typeof section>) => set({ sections: doc.sections.map((row, index) => index === i ? { ...row, ...patch } : row) });
        return <Entry key={i} title={"Section " + (i + 1)} index={i} size={doc.sections.length}
          move={(delta) => set({ sections: reorder(doc.sections, i, delta) })} remove={() => set({ sections: doc.sections.filter((_, index) => index !== i) })}>
          <label>Section title<input value={section.title} onChange={(e) => update({ title: e.target.value })} /></label>
          <label>Section guidance<textarea rows={3} value={section.content} onChange={(e) => update({ content: e.target.value })} /></label>
          <Values label="Examples (one per line)" values={section.examples} set={(examples) => update({ examples })} />
          <Choices title="Related tags" options={doc.tags.map(({ id }) => id)} value={section.relatedTags} set={(relatedTags) => update({ relatedTags })} />
        </Entry>;
      })}
    </Rows>
    <section className="policy-stack"><h3>Decision guidance</h3>{decisions.map((action) =>
      <label key={action}>{readable(action)} guidance<textarea rows={2} value={doc.decisionGuidance.find((row) => row.action === action)?.text ?? ""}
        onChange={(e) => set({ decisionGuidance: [...doc.decisionGuidance.filter((row) => row.action !== action),
          ...(e.target.value ? [{ action, text: e.target.value }] : [])] })} /></label>)}</section>
  </div>;
}

type Issue = { path: PropertyKey[]; message: string };
export function PolicyEditor({ policyId, version, refresh }: { policyId: string; version: EditableVersion; refresh: () => void }) {
  const [tab, setTab] = useState<typeof techniques[number]>("Content");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [valid, setValid] = useState(false);
  const [expected, setExpected] = useState(version.revision);
  const [publication, setPublication] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const action = usePolicyAction();
  const form = useForm({ defaultValues: { document: version.document, changeSummary: version.changeSummary } });
  const { document, changeSummary } = form.watch();
  const dirty = form.formState.isDirty;
  const editable = version.status === "DRAFT";
  const root = "/policies/" + policyId + "/versions/" + version.id;
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const leave = (event: MouseEvent) => {
      const anchor = event.target instanceof Element && event.target.closest("a[href]");
      if (anchor && !event.ctrlKey && !event.metaKey && !window.confirm("Discard your unsaved policy changes?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload);
    window.document.addEventListener("click", leave, true);
    return () => { window.removeEventListener("beforeunload", unload); window.document.removeEventListener("click", leave, true); };
  }, [dirty]);
  const update = (patch: Partial<PolicyDocument>) => {
    form.setValue("document", { ...document, ...patch }, { shouldDirty: true });
    setValid(false);
  };
  async function validate() {
    const local = policyDocument.safeParse(document);
    if (!local.success) { setIssues(local.error.issues); return; }
    const remote = await action.run<{ valid: boolean; issues: Issue[] }>(root + "/validate", { document: local.data });
    if (remote) { setIssues(remote.issues); setValid(remote.valid); }
  }
  async function save() {
    const parsed = policyDocument.safeParse(document);
    if (!parsed.success) { setIssues(parsed.error.issues); return; }
    if (changeSummary.trim().length < 3) { setIssues([{ path: ["changeSummary"], message: "Enter a change summary." }]); return; }
    const result = await action.run<EditableVersion>(root, { revision: expected, document: parsed.data, changeSummary }, "patch", "Draft saved.");
    if (result) { setExpected(result.revision); form.reset({ document: result.document, changeSummary: result.changeSummary }); setIssues([]); }
  }
  async function transition(next: string) {
    const result = await action.run<EditableVersion>(root + "/" + next, { revision: expected }, "post", "Version updated.");
    if (result) { setExpected(result.revision); setPublication(false); dialog.current?.close(); refresh(); }
  }
  return <section className="wf-panel policy-stack">
    <div className="policy-title"><div><h2>Version {version.number}</h2><p>{readable(version.status)}</p></div>
      {version.publishedAt && <p>Published {new Date(version.publishedAt).toLocaleString()}</p>}</div>
    {editable ? <>
      <label>Change summary<input maxLength={500} {...form.register("changeSummary")} /></label>
      <div className="policy-actions" role="group" aria-label="Policy editor sections">{techniques.map((item) =>
        <button key={item} type="button" aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div>
      {tab === "Content" && <ContentEditor doc={document} set={update} />}
      {tab === "Tags" && <TagEditor doc={document} set={(tags) => update({ tags })} issues={issues} />}
      {tab === "Review form" && <FormEditor doc={document} set={(fields) => update({ fields })} issues={issues} />}
      {tab === "Evidence requirements" && <EvidenceEditor doc={document} set={(evidence) => update({ evidence })} issues={issues} />}
      {tab === "Preview" && <PolicyContents document={document} definitions />}
      <div className="policy-actions"><button type="button" disabled={action.busy} onClick={() => void validate()}>Validate draft</button>
        <button type="button" className="wf-primary" disabled={action.busy || !dirty} onClick={() => void save()}>Save draft</button>
        <button type="button" disabled={action.busy || dirty} onClick={() => void transition("submit-review")}>Submit for review</button>
        {dirty && <span className="policy-muted">Unsaved changes</span>}</div>
    </> : <>
      <PolicyContents document={version.document} definitions />
      {version.contentHash && <small className="policy-wrap">Content hash · {version.contentHash}</small>}
      {version.status === "IN_REVIEW" && <div className="policy-actions">
        <button type="button" onClick={() => void transition("return-draft")} disabled={action.busy}>Return to draft</button>
        <button type="button" className="wf-primary" disabled={action.busy} onClick={() => { setPublication(true); dialog.current?.showModal(); }}>Publish version</button>
      </div>}
      {version.status === "PUBLISHED" && <button type="button" disabled={action.busy} onClick={() => { setPublication(false); dialog.current?.showModal(); }}>Archive version</button>}
      <dialog className="policy-dialog" ref={dialog} aria-labelledby="policy-confirmation">
        <h2 id="policy-confirmation">{publication ? "Publish this policy version?" : "Archive this policy version?"}</h2>
        <p>{publication ? "Existing assignments will advance for new reservations. Active cases keep the version they already hold."
          : "The version stays in history. Remove its active assignments before archiving."}</p>
        {action.error && <p role="alert">{action.error}</p>}
        <div className="policy-actions"><button type="button" onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="button" className="wf-primary" disabled={action.busy} onClick={() => void transition(publication ? "publish" : "archive")}>
            {publication ? "Confirm publication" : "Confirm archive"}
          </button></div>
      </dialog>
    </>}
    {issues.length > 0 && <div role="alert"><strong>Review policy validation</strong><ul>{issues.map((issue, i) =>
      <li key={i}>{issue.path.join(" › ")} · {issue.message}</li>)}</ul></div>}
    {valid && <p role="status">Draft validation passed.</p>}
    {action.error && <p role="alert">{action.error}</p>}{action.message && <p role="status">{action.message}</p>}
  </section>;
}
