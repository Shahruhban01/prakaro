import { useState } from "react";
import { BookOpen } from "lucide-react";
import { readable, type PinnedPolicy, type PolicyDocument } from "./policyApi";

export function PolicyContents({ document, definitions = false }: { document: PolicyDocument; definitions?: boolean }) {
  const [search, setSearch] = useState("");
  const matches = (...items: string[]) => items.join(" ").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const sections = document.sections.filter((section) => matches(section.title, section.content, ...section.examples,
    ...section.relatedTags.map((id) => document.tags.find((tag) => tag.id === id)?.label ?? id)));
  const tags = document.tags.filter((tag) => matches(tag.id, tag.label, tag.description, tag.category, ...tag.examples));
  const guidance = document.decisionGuidance.filter((item) => matches(item.action, item.text));
  const overview = document.overview && matches(document.overview);
  const fields = document.fields.filter((field) => matches(field.id, field.label, field.type, field.description));
  const evidence = document.evidence.filter((item) => matches(item.label, item.type));
  return <div className="policy-content">
    <label>Search policy<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    {overview && <div><h3>Overview</h3><p>{document.overview}</p></div>}
    {sections.map((item, index) => <section key={index}><h3>{item.title}</h3><p>{item.content}</p>
      {!!item.examples.length && <ul>{item.examples.map((example, i) => <li key={i}>{example}</li>)}</ul>}
      {!!item.relatedTags.length && <small>Related tags · {item.relatedTags.map((id) => document.tags.find((tag) => tag.id === id)?.label ?? id).join(", ")}</small>}
    </section>)}
    {guidance.map((item) => <section key={item.action}><h3>{readable(item.action)}</h3><p>{item.text}</p></section>)}
    {!!tags.length && <section><h3>Tag definitions</h3><dl>{tags.map((tag) => <div key={tag.id}>
      <dt>{tag.label} <small>{tag.category} · {tag.id}</small></dt>
      <dd>{tag.description || "No additional guidance."}</dd>
      {definitions && <dd>{tag.required ? "Required" : "Optional"} · {tag.actions.map(readable).join(", ")}
        {tag.when && " · when " + tag.when.key + " is " + String(tag.when.equals)}
        {!!tag.excludes.length && " · excludes " + tag.excludes.join(", ")}</dd>}
      {!!tag.examples.length && <dd>{tag.examples.join(" · ")}</dd>}
    </div>)}</dl></section>}
    {!!evidence.length && <section><h3>Evidence requirements</h3><ul>{evidence.map((item) => <li key={item.id}>
      {item.label} · {readable(item.type)} · {item.required ? "Required" : "Optional"} · minimum {item.minimum}
      {definitions && " · " + item.actions.map(readable).join(", ")}
      {definitions && item.when && " · when " + item.when.key + " is " + String(item.when.equals)}
    </li>)}</ul></section>}
    {definitions && !!fields.length && <section><h3>Review form definitions</h3><dl>{fields.map((item) => <div key={item.id}>
      <dt>{item.label} <small>{item.id}</small></dt>
      <dd>{readable(item.type)} · {item.required ? "Required" : "Optional"}{item.options.length ? " · " + item.options.join(", ") : ""}
        {item.when && " · when " + item.when.key + " is " + String(item.when.equals)}</dd>
      {item.description && <dd>{item.description}</dd>}
    </div>)}</dl></section>}
    {!overview && !sections.length && !guidance.length && !tags.length && !evidence.length && !(definitions && fields.length) &&
      <p>No matching policy guidance.</p>}
  </div>;
}
export function PinnedPolicyReference({ policy, historical = false }: { policy: PinnedPolicy; historical?: boolean }) {
  return <details className="mw-panel mw-policy policy-ui" id={historical ? undefined : "mw-policy-reference"}>
    <summary className="mw-panel-heading"><BookOpen size={17} /><strong>{historical ? "Original pinned policy" : "Review policy"} · {policy.policy.name}</strong>
      <span className="mw-pill">Version {policy.number}</span></summary>
    <div className="mw-body">
      {policy.publishedAt && <p className="policy-muted">Published {new Date(policy.publishedAt).toLocaleDateString()}</p>}
      <PolicyContents document={policy.document} definitions={historical} />
    </div>
  </details>;
}
