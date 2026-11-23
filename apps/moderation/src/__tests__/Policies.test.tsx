import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { PolicyEditor, type EditableVersion } from "../components/policy/PolicyEditor";
import { PoliciesPage } from "../components/policy/PolicyPages";
import { DecisionForm } from "../components/continuous/DecisionForm";
import { policyDocument, type PinnedPolicy } from "../components/policy/policyApi";

const api = vi.hoisted(() => ({ get: vi.fn(), request: vi.fn(), actor: { userId: "admin", role: "MODERATION_ADMIN", superAdmin: false } }));
vi.mock("../api", () => ({ api, useData: () => ({ data: api.actor }), errorText: (error: Error) => error.message }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); api.get.mockReset(); api.request.mockReset(); api.actor.role = "MODERATION_ADMIN"; });
const doc = policyDocument.parse({
  overview: "Check independent evidence.",
  sections: [], decisionGuidance: [],
  tags: [{ id: "supported", label: "Evidence supported", required: true, actions: ["APPROVE"] }],
  fields: [
    { id: "checked", label: "Inspection completed", type: "CHECKBOX", required: true },
    { id: "note", label: "Inspection record", type: "SHORT_TEXT", required: true, when: { key: "checked", equals: true } },
  ],
  evidence: [{ id: "inspection", label: "Inspection evidence", required: true, type: "INDEPENDENT_VERIFICATION", actions: ["APPROVE"] }],
});
const version: EditableVersion = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", number: 1, status: "DRAFT", revision: 0,
  changeSummary: "First policy", archivedAt: null, publishedAt: null, contentHash: null, document: doc,
};
function wrapped(element: React.ReactNode, path = "/") {
  return render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })}>{element}</QueryClientProvider></MemoryRouter>);
}
it("loads the policy list and prevents unauthorized administration screens", async () => {
  api.get.mockResolvedValue({ data: { total: 1, rows: [{
    id: "policy-id", name: "Inspection procedures", category: "Parking", versions: [{ number: 2, status: "PUBLISHED" }],
  }] } });
  const list = wrapped(<PoliciesPage />);
  expect(await screen.findByRole("link", { name: "Inspection procedures" })).toBeTruthy();
  expect(screen.getByText("v2 · Published")).toBeTruthy();
  list.unmount();
  api.actor.role = "MODERATOR";
  wrapped(<PoliciesPage />, "/new");
  expect(screen.getByRole("alert").textContent).toContain("restricted");
});

it("validates draft edits and previews tags, form definitions and evidence requirements", async () => {
  wrapped(<PolicyEditor policyId="policy-id" version={version} refresh={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: "Tags" }));
  fireEvent.change(screen.getByLabelText("Tag ID"), { target: { value: "bad id" } });
  fireEvent.click(screen.getByRole("button", { name: "Validate draft" }));
  expect(screen.getByRole("alert").textContent).toContain("tags");
  expect(api.request).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Tag ID"), { target: { value: "supported" } });
  fireEvent.click(screen.getByRole("button", { name: "Review form" }));
  expect(screen.getAllByLabelText("Field type")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Evidence requirements" }));
  expect(screen.getByLabelText("Minimum evidence count")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect(screen.getByRole("heading", { name: "Tag definitions" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Review form definitions" })).toBeTruthy();
});

it("requires explicit publication confirmation and submits the current draft revision", async () => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
  api.request.mockResolvedValue({ data: { ...version, status: "PUBLISHED", revision: 4 } });
  wrapped(<PolicyEditor policyId="policy-id" version={{ ...version, status: "IN_REVIEW", revision: 3 }} refresh={() => undefined} />);
  fireEvent.click(screen.getByRole("button", { name: "Publish version" }));
  expect(screen.getByRole("dialog", { name: "Publish this policy version?" })).toBeTruthy();
  expect(api.request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm publication" }));
  await waitFor(() => expect(api.request).toHaveBeenCalledWith({
    method: "post", url: "/policies/policy-id/versions/" + version.id + "/publish", data: { revision: 3 },
  }));
});

it("submits only the pinned identifiers and visible, validated form answers", async () => {
  const pinned: PinnedPolicy = {
    id: version.id, policyId: "policy-id", number: 4, policy: { name: "Inspection procedures" },
    document: doc, publishedAt: null, contentHash: null,
  };
  const evidence = [{ id: "current-evidence", source: "PRAKARO_AUDIT", finding: "CONFIRMED_PARKING", reference: "Synthetic",
    approvedAt: null, expiresAt: "2026-11-23T08:00:00Z" }];
  const submit = vi.fn();
  wrapped(<DecisionForm policy={{ form: [], pinned }} evidence={evidence} frozen={false} context={null}>
    {(decision) => <button type="button" disabled={!decision} onClick={() => submit(decision)}>Commit fixture</button>}
  </DecisionForm>);
  expect(screen.getByText("Version 4")).toBeTruthy();
  expect(screen.queryByLabelText("Inspection record")).toBeNull();
  fireEvent.change(screen.getByLabelText(/^Decision Required/), { target: { value: "APPROVE" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Inspection completed" }));
  fireEvent.change(screen.getByLabelText("Inspection record"), { target: { value: "Synthetic notes" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Confirmed parking/ }));
  fireEvent.change(screen.getByLabelText(/Decision justification/), { target: { value: "Evidence supports this outcome." } });
  const button = screen.getByRole<HTMLButtonElement>("button", { name: "Commit fixture" });
  expect(button.disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Evidence supported/ }));
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  expect(submit).toHaveBeenCalledWith({
    action: "APPROVE", reason: "Evidence supports this outcome.", evidenceIds: ["current-evidence"],
    answers: { checked: true, note: "Synthetic notes" }, tagIds: ["supported"], policyVersionId: pinned.id,
  });
});
