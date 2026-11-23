import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccuracySummary, QaDashboard } from "../components/qa/QaDashboard";
import { OriginalDecisionPanel, QaAssessmentForm } from "../components/qa/QaReviewWorkspace";
import type { Overview, ReviewDetail } from "../components/qa/qa-api";
import type { Actor } from "../api";

const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api", () => ({ api: transport, errorText: (error: Error) => error.message }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const named = { id: "synthetic", name: "Synthetic reviewer" };
const now = "2026-11-22T08:00:00Z";
const detail: ReviewDetail = {
  id: "review-id", assignmentVersion: 3, status: "IN_REVIEW", startedAt: now, completedAt: now,
  assignedTo: null, leaseUntil: null, assignee: null, queue: named, organization: named, lob: named, moderator: named,
  decision: {
    version: 1, action: "APPROVE", createdAt: now, reason: "Original justification", policyVersion: 4,
    evidenceIds: ["old"], answers: { basis: "Inspection" },
    case: { id: "case-id", code: "SYNTHETIC", facilityId: "facility-id", status: "APPROVED" },
    qaSnapshot: { facilityId: "facility-id", form: [{ key: "basis", label: "Policy tag" }],
      reviewPolicy: "Original policy", publication: "CONFIRM_PARKING", truncated: false,
      evidence: [{ id: "old", source: "PRAKARO_AUDIT", finding: "CONFIRMED_PARKING", reference: "Historical inspection", expiresAt: now, cited: true }] },
  },
  policy: null, assessment: null, dispute: null, correction: null, history: [], eligibleAuditors: [],
  currentEvidence: [{ id: "new", source: "PRAKARO_AUDIT", finding: "CONFIRMED_PARKING", reference: "New inspection", expiresAt: now }],
  capabilities: { assess: true, adjudicate: false, dispute: false, assign: false, recommend: false },
};
const metrics: Overview = {
  generatedAt: now, eligible: 12, sampled: 6, eligibleProcessed: 12, manual: 0, pending: 2, working: 1,
  complete: 2, disputes: 1, correctionsPending: 1, correctionsCompleted: 0, evaluated: 2, passes: 1, failures: 1,
  accuracy: 50, coverage: 50, overturnRate: null, correctionRate: null, qaHandlingSeconds: 19, errors: [], severities: [],
};
const actor = { userId: "auditor", role: "QA_REVIEWER", superAdmin: false } as Actor;
const options = { organizations: [], queues: [], teams: [], lobs: [], moderators: [], auditors: [] };
const emptyWorklist = { rows: [], page: 1, pageSize: 20, total: 0 };
function dashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><QaDashboard actor={actor} /></MemoryRouter></QueryClientProvider>);
}

describe("post-decision quality workspace", () => {
  it("separates frozen evidence from current evidence and identifies missing historical snapshots", () => {
    const { rerender } = render(<OriginalDecisionPanel item={detail} />);
    expect(screen.getByText("Policy tag")).toBeTruthy();
    expect(screen.getByText("Historical inspection")).toBeTruthy();
    expect(screen.getByText("New inspection").closest("details")?.open).toBe(false);
    fireEvent.click(screen.getByText("Current independent evidence"));
    expect(screen.getByText("New inspection").closest("details")?.open).toBe(true);
    rerender(<OriginalDecisionPanel item={{ ...detail, decision: { ...detail.decision, qaSnapshot: null } }} />);
    expect(screen.getByText(/no historical evidence snapshot/)).toBeTruthy();
  });

  it("keeps unsampled accuracy unavailable and shows the finalized denominator", () => {
    const { rerender } = render(<AccuracySummary data={{ ...metrics, accuracy: null, evaluated: 0 }} />);
    const card = screen.getByText("Finalized accuracy").closest("dl")!;
    expect(within(card).getByText("Unavailable")).toBeTruthy();
    rerender(<AccuracySummary data={metrics} />);
    expect(within(card).getByText("50%")).toBeTruthy();
    expect(within(card).getByText("2 QA evaluations")).toBeTruthy();
    expect(screen.getByText("6 sampled / 12 eligible")).toBeTruthy();
  });

  it("validates a fail before submission and sends only validated fields and the assignment version", async () => {
    const perform = vi.fn().mockResolvedValue(undefined);
    const action = { perform, pending: false, error: "", message: "" };
    render(<QaAssessmentForm item={detail} action={action} />);
    fireEvent.click(screen.getByRole("radio", { name: "QA Fail" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit QA assessment" }));
    await waitFor(() => expect(screen.getByLabelText("Error category").getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByLabelText("Severity").getAttribute("aria-invalid")).toBe("true");
    expect(perform).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Error category"), { target: { value: "MISSING_EVIDENCE" } });
    fireEvent.change(screen.getByLabelText("Severity"), { target: { value: "MAJOR" } });
    fireEvent.change(screen.getByLabelText("Policy reference"), { target: { value: "Policy 1" } });
    fireEvent.change(screen.getByLabelText("Explanation"), { target: { value: "Evidence needs corroboration." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit QA assessment" }));
    await waitFor(() => expect(perform).toHaveBeenCalledWith("/qa/reviews/review-id/submit", {
      version: 3, assessment: { outcome: "FAIL", category: "MISSING_EVIDENCE", severity: "MAJOR",
        policyReference: "Policy 1", notes: "Evidence needs corroboration." },
    }, "QA assessment recorded."));
  });

  it("submits a pass without stale fields from a previous fail selection", async () => {
    const perform = vi.fn().mockResolvedValue(undefined);
    render(<QaAssessmentForm item={detail} action={{ perform, pending: false, error: "", message: "" }} />);
    fireEvent.click(screen.getByRole("radio", { name: "QA Fail" }));
    fireEvent.change(screen.getByLabelText("Policy reference"), { target: { value: "Previous draft" } });
    fireEvent.click(screen.getByRole("radio", { name: "QA Pass" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit QA assessment" }));
    await waitFor(() => expect(perform).toHaveBeenCalledWith("/qa/reviews/review-id/submit",
      { version: 3, assessment: { outcome: "PASS", notes: undefined } }, "QA assessment recorded."));
  });

  it("renders loading and empty worklists and prevents duplicate claim clicks", async () => {
    transport.get.mockImplementation((path: string) => Promise.resolve({
      data: path.endsWith("dashboard") ? metrics : path.endsWith("options") ? options : emptyWorklist,
    }));
    let respond!: (payload: { data: { id: null } }) => void;
    transport.post.mockReturnValue(new Promise((resolve) => { respond = resolve; }));
    dashboard();
    expect(screen.getByText("Loading QA reviews…")).toBeTruthy();
    await screen.findByText("No QA reviews match these filters.");
    const claim = screen.getByRole<HTMLButtonElement>("button", { name: "Claim next review" });
    fireEvent.click(claim);
    fireEvent.click(claim);
    expect(claim.disabled).toBe(true);
    expect(transport.post).toHaveBeenCalledTimes(1);
    await act(async () => respond({ data: { id: null } }));
    expect(await screen.findByText("No reviews are available to claim.")).toBeTruthy();
  });

  it("displays a scoped request error instead of an empty success state", async () => {
    transport.get.mockImplementation((path: string) => path.endsWith("reviews")
      ? Promise.reject(new Error("QA access was revoked."))
      : Promise.resolve({ data: path.endsWith("dashboard") ? metrics : options }));
    dashboard();
    expect(await screen.findByText("QA access was revoked.")).toBeTruthy();
    expect(screen.queryByText("No QA reviews match these filters.")).toBeNull();
  });
});
