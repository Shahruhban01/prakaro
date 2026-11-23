import { useState } from "react";
import type { Evidence } from "../continuous/workspaceContract";
import { readable, type PolicyDocument, type PolicyField } from "./policyApi";

type Tag = PolicyDocument["tags"][number];
export function DynamicTags({ available, selected, set, error }: {
  available: Tag[]; selected: string[]; set: (values: string[]) => void; error?: string;
}) {
  const [search, setSearch] = useState("");
  if (!available.length) return null;
  const matches = available.filter(({ label, id, description }) => [label, id, description].some((value) =>
    value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const categories = [...new Set(matches.map(({ category }) => category))];
  return <fieldset className="mw-field-group">
    <legend>Policy tags</legend>
    <label>Search policy tags<input id="mw-tag-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    {!!selected.length && <p className="mw-muted">Selected · {available.filter((tag) => selected.includes(tag.id)).map(({ label }) => label).join(", ")}</p>}
    {categories.map((group) => <div key={group} className="mw-tags"><strong>{group}</strong>
      <div className="mw-tag-options">{matches.filter(({ category }) => category === group).map((tag) =>
        <button key={tag.id} type="button" className="mw-chip" aria-pressed={selected.includes(tag.id)}
          aria-describedby={error ? "pinned-tags-error" : undefined} title={tag.description}
          onClick={() => set(selected.includes(tag.id) ? selected.filter((id) => id !== tag.id) : [...selected, tag.id])}>
          {tag.label}{tag.required && <span> Required</span>}
        </button>)}</div>
    </div>)}
    {!matches.length && <p>No matching tags.</p>}
    {error && <p id="pinned-tags-error" className="mw-error">{error}</p>}
  </fieldset>;
}

export function DynamicField({ field, value, set, evidence, error }: {
  field: PolicyField; value: unknown; set: (value: unknown) => void; evidence: Evidence[]; error?: string;
}) {
  const id = "policy-field-" + field.id;
  const text = typeof value === "string" ? value : "";
  const selected = Array.isArray(value) ? value : [];
  const attrs = { "aria-invalid": Boolean(error), "aria-describedby": id + "-help" };
  let control;
  switch (field.type) {
    case "LONG_TEXT":
      control = <textarea id={id} {...attrs} rows={3} maxLength={field.max ?? 4000} value={text} onChange={(event) => set(event.target.value)} />;
      break;
    case "CHECKBOX":
      control = <label className="policy-choice"><input id={id} {...attrs} type="checkbox" checked={value === true}
        onChange={(event) => set(event.target.checked)} />{field.label}</label>;
      break;
    case "SELECT": case "EVIDENCE":
      control = <select id={id} {...attrs} value={text} onChange={(event) => set(event.target.value)}><option value="">Choose an option</option>
        {field.type === "EVIDENCE" ? evidence.map((item) => <option key={item.id} value={item.id}>{readable(item.finding)} · {item.reference}</option>) :
          field.options.map((option) => <option key={option}>{option}</option>)}</select>;
      break;
    case "RADIO": case "MULTI":
      control = <div className="mw-checkboxes">{field.options.map((option) => <label key={option}>
        {field.type === "RADIO" ? <input {...attrs} type="radio" name={id} checked={value === option} onChange={() => set(option)} /> :
          <input {...attrs} type="checkbox" checked={selected.includes(option)}
            onChange={(event) => set(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} />}
        {option}</label>)}</div>;
      break;
    default:
      control = <input id={id} {...attrs} type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "date" : "text"}
        value={field.type === "NUMBER" && typeof value === "number" ? value : text} step={field.type === "NUMBER" ? "any" : undefined}
        min={field.type === "NUMBER" ? field.min : undefined} max={field.type === "NUMBER" ? field.max : undefined}
        maxLength={field.type === "SHORT_TEXT" ? field.max ?? 500 : undefined}
        onChange={(event) => set(field.type === "NUMBER" && event.target.value ? event.target.valueAsNumber : event.target.value)} />;
  }
  return <fieldset className="mw-field-group">
    <legend>{field.label} {field.required && <span>Required</span>}</legend>
    {!["CHECKBOX","MULTI","RADIO"].includes(field.type) && <label className="sr-only" htmlFor={id}>{field.label}</label>}
    {control}
    <div id={id + "-help"}>{field.description && <p className="mw-muted">{field.description}</p>}
      {error && <p className="mw-error">{error}</p>}</div>
  </fieldset>;
}
