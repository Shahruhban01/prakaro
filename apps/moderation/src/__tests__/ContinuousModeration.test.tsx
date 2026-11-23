import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Queue } from "../api";
import type { AuxSnapshot } from "../attendanceApi";
import { ModerateWorkspace } from "../components/continuous/ModerateWorkspace";
import { EvidenceGallery } from "../components/continuous/CaseEvidencePanel";
import type { Reservation, Snapshot } from "../components/continuous/workspaceContract";

const fake = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), navigate: vi.fn() }));
vi.mock("../api", () => ({ api: { get: fake.get, post: fake.post } }));
vi.mock("react-router-dom", async (original) => ({
  ...await original<typeof import("react-router-dom")>(),
  useNavigate: () => fake.navigate,
}));

const queue = { id: "queue", name: "Parking verification" } as Queue;
const aux = { state: "MODERATING", presence: "ONLINE" } as AuxSnapshot;
const server = Date.parse("2026-11-22T10:00:00Z");
const time = (offset: number) => new Date(server + offset).toISOString();

function reservation(id = "first"): Reservation {
  return {
    id, queueId: queue.id, reservedAt: time(-45000), leaseExpiresAt: time(255000),
    case: {
      code: "CASE-" + id, status: "IN_REVIEW", category: "PARKING_ISSUE", trigger: "REPORT",
      priority: 90, createdAt: time(-320000),
      admission: { facility: {
        id: "facility", displayName: "Synthetic Garage", formattedAddress: null,
        evidence: [{ id: "evidence", finding: "CONFIRMED_PARKING", reference: "Synthetic inspection",
          source: "PRAKARO_AUDIT", approvedAt: time(-860000), expiresAt: time(3600000) }],
      } },
      metadata: { report: { category: "RESTRICTED_ACCESS", notes: "Gate was locked after 6pm" } },
      tasks: [{ queueId: queue.id, queueVersion: 3, form: {
        reviewPolicy: "Check current independent evidence.\n\nRecord unresolved concerns.",
        form: [
          { key: "tag", type: "REASON", label: "Policy tag", required: true, options: ["Inspection", "Ambiguous"] },
          { key: "note", type: "TEXT", label: "Escalation detail", required: true, options: [],
            when: { key: "tag", equals: "Ambiguous" } },
        ],
      } }],
    },
  };
}

function load(snapshot: Partial<Snapshot> = {}) {
  fake.get.mockResolvedValue({ data: { session: { id: "session", casesCompleted: 0 },
    reservation: reservation(), serverTime: time(0), ...snapshot } });
}

function mount({ pending = true, ready = true } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter>
    <ModerateWorkspace queue={queue} aux={ready ? aux : { ...aux, state: "BREAK" }} hasPendingCases={pending} />
  </MemoryRouter></QueryClientProvider>);
}

const submit = () => screen.getByRole("button", { name: "Submit → Next" }) as HTMLButtonElement;
const leave = () => screen.getByRole("button", { name: "Submit & Leave" }) as HTMLButtonElement;
function fill(action = "REJECT") {
  fireEvent.change(screen.getByLabelText(/Decision Required/), { target: { value: action } });
  fireEvent.click(screen.getByRole("button", { name: "Inspection" }));
  fireEvent.change(screen.getByLabelText(/Decision justification/), { target: { value: "Synthetic review justification" } });
}
function fail(status?: number, code?: string) {
  return new AxiosError("request error", undefined, undefined, undefined, status ?
    { status, data: { error: { code, message: "Server validation error" } } } as never : undefined);
}

beforeEach(() => {
  fake.get.mockReset();
  fake.post.mockReset();
  fake.navigate.mockReset();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("loads the current session without allocating while the request is pending", () => {
  fake.get.mockReturnValue(new Promise(() => {}));
  mount();
  expect(screen.getByText("Connecting to moderation…")).toBeTruthy();
  expect(fake.post).not.toHaveBeenCalled();
});

it.each([{ pending: false, ready: true }, { pending: true, ready: false }])(
  "gates starting with prerequisites %o", async (props) => {
    load({ session: null, reservation: null });
    mount(props);
    const button = await screen.findByRole("button", { name: "Start moderation" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  },
);

it("starts from the queue when eligible and displays the authoritative timer and case header", async () => {
  load({ session: null, reservation: null });
  fake.post.mockResolvedValue({ data: { session: { id: "session", casesCompleted: 0 },
    reservation: reservation(), serverTime: time(0) } });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Start moderation" }));
  await screen.findByRole("heading", { name: "CASE-first" });
  expect(screen.getByRole("timer").textContent).toMatch(/^4[45]s$/);
  expect(screen.getByText("IN REVIEW")).toBeTruthy();
  expect(screen.getByText("Lease active")).toBeTruthy();
});

it("distinguishes user claims, independent evidence, and missing facility details", async () => {
  load();
  mount();
  expect(await screen.findByText("Gate was locked after 6pm")).toBeTruthy();
  expect(screen.getByText("Source: User report")).toBeTruthy();
  expect(screen.getByText("Synthetic inspection")).toBeTruthy();
  expect(screen.getByText("Not provided")).toBeTruthy();
});

it("shows a missing-evidence state and requires a citation for approval", async () => {
  const item = reservation();
  item.case.admission = undefined;
  load({ reservation: item });
  mount();
  expect(await screen.findByText("No independent evidence references on record.")).toBeTruthy();
  fill("APPROVE");
  expect(screen.getByText("Select current independent evidence to approve parking.")).toBeTruthy();
  expect(submit().disabled).toBe(true);
});

it("handles broken images and refuses unexpected media paths", () => {
  render(<EvidenceGallery attachments={[
    { id: "one", contentType: "image/png", path: "/api/v1/moderation/evidence/one/media", description: "Test photo" },
    { id: "two", contentType: "image/png", path: "https://untrusted.example/photo.png", description: "Injected URL" },
  ]} />);
  expect(screen.queryByAltText("Injected URL")).toBeNull();
  fireEvent.error(screen.getByAltText("Test photo"));
  expect(screen.getAllByText("Attachment unavailable.").length).toBeGreaterThanOrEqual(2);
  fireEvent.click(screen.getByRole("button", { name: "Inspect attachment 1" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("searches versioned policy guidance and tags, and validates a conditional field", async () => {
  load();
  mount();
  await screen.findByText("Version 3");
  fireEvent.change(screen.getByLabelText("Search policy"), { target: { value: "unresolved" } });
  expect(screen.queryByText("Check current independent evidence.")).toBeNull();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search Policy tag" }), { target: { value: "ambi" } });
  expect(screen.queryByRole("button", { name: "Inspection" })).toBeNull();
  fireEvent.change(screen.getByLabelText(/Decision Required/), { target: { value: "ESCALATE" } });
  fireEvent.click(screen.getByRole("button", { name: "Ambiguous" }));
  expect(screen.getByRole("button", { name: "Remove Ambiguous" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/Decision justification/), { target: { value: "Clarify scope" } });
  expect(submit().disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Escalation detail"), { target: { value: "Operator permission" } });
  expect(submit().disabled).toBe(false);
});

it("requires an explicit decision and policy tag", async () => {
  load();
  mount();
  await screen.findByText("CASE-first");
  fireEvent.change(screen.getByLabelText(/Decision justification/), { target: { value: "Sufficient reason" } });
  expect(submit().disabled).toBe(true);
  fireEvent.change(screen.getByLabelText(/Decision Required/), { target: { value: "REJECT" } });
  expect(submit().disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Inspection" }));
  expect(submit().disabled).toBe(false);
});

it("prevents duplicate clicks and advances on the same route with a new draft and server timer", async () => {
  load();
  mount();
  await screen.findByText("CASE-first");
  fill();
  let resolve!: (response: unknown) => void;
  fake.post.mockReturnValue(new Promise((done) => { resolve = done; }));
  const submitButton = submit();
  fireEvent.click(submitButton);
  fireEvent.click(submitButton);
  await waitFor(() => expect(fake.post).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "Saving…" }).hasAttribute("disabled")).toBe(true);
  await act(async () => resolve({ data: { casesCompleted: 1, sessionEnded: false,
    nextReservation: { ...reservation("next"), reservedAt: time(0) }, serverTime: time(0) } }));
  expect(await screen.findByText("CASE-next")).toBeTruthy();
  expect(screen.getByRole("timer").textContent).toBe("0s");
  expect(screen.getByText("Decision saved.")).toBeTruthy();
  expect((screen.getByLabelText(/Decision justification/) as HTMLTextAreaElement).value).toBe("");
  expect(submit().disabled).toBe(true);
  expect(fake.navigate).not.toHaveBeenCalled();
});

it("retains the draft after validation rejection and stays on the active case", async () => {
  load();
  mount();
  await screen.findByText("CASE-first");
  fill();
  fake.post.mockRejectedValueOnce(fail(422, "INVALID_REVIEW_ANSWERS"));
  fireEvent.click(submit());
  expect(await screen.findByText("Server validation error")).toBeTruthy();
  expect((screen.getByLabelText(/Decision justification/) as HTMLTextAreaElement).value).toBe("Synthetic review justification");
  expect(screen.getByRole("button", { name: "Remove Inspection" })).toBeTruthy();
});

it("uses the same decision and reservation after an ambiguous disconnect", async () => {
  load();
  mount();
  await screen.findByText("CASE-first");
  fill();
  fake.post.mockRejectedValueOnce(fail()).mockResolvedValueOnce({ data: {
    casesCompleted: 1, sessionEnded: false, nextReservation: reservation("next"), serverTime: time(0),
  } });
  fireEvent.click(submit());
  await screen.findAllByText("Connection interrupted");
  expect(leave().disabled).toBe(true);
  fireEvent.click(submit());
  await screen.findByText("CASE-next");
  expect(fake.post.mock.calls[0]).toEqual(fake.post.mock.calls[1]);
});

it("keeps the active draft when reconnecting restores the same reservation", async () => {
  load();
  mount();
  await screen.findByText("CASE-first");
  fill();
  fake.post.mockRejectedValueOnce(fail(422, "INVALID_REVIEW_ANSWERS"));
  fireEvent.click(submit());
  fireEvent.click(await screen.findByRole("button", { name: "Restore session" }));
  await waitFor(() => expect(fake.get).toHaveBeenCalledTimes(2));
  expect((screen.getByLabelText(/Decision justification/) as HTMLTextAreaElement).value).toBe("Synthetic review justification");
});

it("waits for confirmation before Submit & Leave returns to subscribed queues", async () => {
  load();
  mount();
  await screen.findByText("CASE-first");
  fill();
  fake.post.mockResolvedValueOnce({ data: { casesCompleted: 1, sessionEnded: true,
    nextReservation: null, serverTime: time(0) } });
  fireEvent.click(leave());
  await waitFor(() => expect(fake.navigate).toHaveBeenCalledWith("/my-queues",
    { state: { moderationCompleted: 1 } }));
  expect(fake.post.mock.calls[0][0]).toBe("/reservations/first/submit-and-leave");
});

it("confirms release and only calls the atomic leave endpoint after consent", async () => {
  load();
  mount();
  await screen.findByText("CASE-first");
  fireEvent.click(screen.getByRole("button", { name: "Release & Leave" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(fake.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep reviewing" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Release & Leave" }));
  fake.post.mockResolvedValueOnce({ data: { sessionEnded: true } });
  fireEvent.click(screen.getByRole("button", { name: "Release and leave" }));
  await waitFor(() => expect(fake.navigate).toHaveBeenCalledWith("/my-queues"));
  expect(fake.post.mock.calls[0][0]).toBe("/sessions/session/leave");
});

it("stops when the queue is empty and keeps the session total", async () => {
  load({ reservation: null, session: { id: "session", casesCompleted: 12 } });
  mount();
  expect(await screen.findByText("No pending cases are currently available.")).toBeTruthy();
  expect(screen.getByText("12")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  expect(fake.post).not.toHaveBeenCalled();
});

it("blocks a valid-looking submission after server-anchored lease expiry", async () => {
  const initial = reservation();
  initial.leaseExpiresAt = time(-1000);
  load({ reservation: initial });
  mount();
  await screen.findByText("CASE-first");
  fill();
  expect(submit().disabled).toBe(true);
  expect(screen.getByText("Lease expired")).toBeTruthy();
  expect(fake.post).not.toHaveBeenCalled();
});

it("hides case evidence when restoration reports access revocation", async () => {
  fake.get.mockRejectedValueOnce(fail(403));
  mount();
  expect(await screen.findByText("Access revoked")).toBeTruthy();
  expect(screen.queryByText("Synthetic inspection")).toBeNull();
});

it("focuses fields using shortcuts without submitting from the keyboard", async () => {
  load();
  mount();
  await screen.findByText("CASE-first");
  fireEvent.keyDown(document.body, { code: "KeyD", altKey: true, shiftKey: true });
  expect(document.activeElement?.id).toBe("action-select");
  fireEvent.keyDown(document.body, { code: "KeyP", altKey: true, shiftKey: true });
  expect(document.querySelector("details")?.open).toBe(true);
  expect(fake.post).not.toHaveBeenCalled();
});
