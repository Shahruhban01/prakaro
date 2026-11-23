import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { OperationsPage } from "../components/operations/OperationsPage";
import { CapacityTable } from "../components/operations/PlanningPages";
import { calendarRange } from "../components/operations/SchedulePage";

const testApi = vi.hoisted(() => ({ get: vi.fn(), request: vi.fn(),
  actor: { userId: "director", role: "MODERATION_ADMIN", superAdmin: false } }));
vi.mock("../api", () => ({ api: testApi, useData: () => ({ data: testApi.actor }), errorText: (error: Error) => error.message }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const option = {
  organizations: [{ id: "organization", name: "Parking" }], teams: [{ id: "team", name: "North" }],
  employees: [{ id: "staff", name: "Fixture Reviewer", status: "ACTIVE" }], queues: [], lobs: [], shifts: [],
  timezone: "UTC", canManage: true, canAdmin: true,
};
function page(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={client}>
    <Routes><Route path="/operations/:view" element={<OperationsPage />} /></Routes>
  </QueryClientProvider></MemoryRouter>);
}

it("uses ordered calendar month bounds and renders an overnight occurrence across both days", async () => {
  expect(calendarRange("2026-12-07", "month")).toEqual({ from: "2026-12-01", through: "2026-12-31" });
  testApi.get.mockImplementation((path: string) => Promise.resolve({ data: path.endsWith("options") ? option : path.endsWith("/shifts") ? [] : {
    count: 1, page: 1, limit: 60, timezone: "UTC", rows: [{ id: "one", employee: { name: "Fixture Reviewer" },
      shiftName: "Night shift", kind: "SHIFT", startsAt: "2026-11-23T22:00:00Z", endsAt: "2026-11-24T06:00:00Z",
      localDate: "2026-11-23", timezone: "UTC", status: "NOT_STARTED" }],
  } }));
  page("/operations/schedule?anchor=2026-11-23");
  expect(await screen.findByText("Night shift")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Week" }));
  await waitFor(() => expect(screen.getAllByText("Night shift")).toHaveLength(2));
  expect(screen.getAllByText(/Overnight/)).toHaveLength(2);
});

it("labels disconnection independently from an active attendance session and reservation", async () => {
  testApi.get.mockImplementation((path: string) => Promise.resolve({ data: path.endsWith("options") ? option : {
    generatedAt: "2026-11-23T04:00:00Z", timezone: "UTC", count: 1, scheduledNow: 1, attending: 1, moderating: 0,
    rows: [{ id: "staff", name: "Fixture Reviewer", role: "MODERATOR", status: "ACTIVE", teams: ["North"],
      attendance: "ACTIVE", presence: "DISCONNECTED", aux: "MODERATING", auxSeconds: 91,
      queue: "Verification", reservationId: "lease", subscriptions: ["Verification"] }],
  } }));
  page("/operations/live");
  const row = await screen.findByRole("row", { name: /Fixture Reviewer/ });
  expect(within(row).getByText("Disconnected")).toBeTruthy();
  expect(within(row).getByText("Case reserved")).toBeTruthy();
  expect(within(row).getByText("91s")).toBeTruthy();
});

it("labels unavailable AHT and forecast data without fabricating zero estimates", async () => {
  render(<CapacityTable rows={[{ id: "one", name: "General", organizationId: null, availableSeconds: 1800, ahtSeconds: null,
    ahtSource: "UNAVAILABLE", historicalCompleted: 0, estimate: null, expected: null, pending: 3,
    netBacklogChange: null, additionalModeratingHours: null, risk: "UNKNOWN" }]} />);
  const row = screen.getByRole("row", { name: /General/ });
  expect(within(row).getAllByText("Unavailable").length).toBeGreaterThan(3);
  cleanup();
  testApi.get.mockImplementation((path: string) => Promise.resolve({ data: path.endsWith("options") ? option : {
    generatedAt: "2026-11-23T04:00:00Z", method: "Same weekday average", throughHistory: "2026-11-22",
    queues: [{ id: "one", name: "General", observations: 2, expected: null, horizonDays: 1, values: [] }],
  } }));
  page("/operations/forecast");
  expect(await screen.findByText("Insufficient historical data.")).toBeTruthy();
});

it("hides platform organization reports for an organization administrator", async () => {
  testApi.get.mockResolvedValue({ data: option });
  page("/operations/organizations");
  expect((await screen.findByRole("alert")).textContent).toContain("outside your access");
  expect(testApi.get).toHaveBeenCalledTimes(1);
});

it("acknowledges a scoped alert and refreshes the persisted state", async () => {
  const rule = { id: "rule", organizationId: "organization", metric: "QUEUE_BACKLOG", severity: "WARNING",
    enabled: true, threshold: 1, intervalSeconds: 60, cooldownSeconds: 30, revision: 1,
    organization: { name: "Parking" }, queue: null };
  let acknowledgedAt: string | null = null;
  testApi.get.mockImplementation((path: string) => Promise.resolve({ data: path.endsWith("options") ? option : {
    rules: [rule], count: 1, page: 1, rows: [{ id: "alert", observed: 2, threshold: 1, severity: "WARNING",
      triggeredAt: "2026-11-23T04:00:00Z", resolvedAt: null, acknowledgedAt, rule }],
  } }));
  testApi.request.mockImplementation(async () => {
    acknowledgedAt = "2026-11-23T04:01:00Z";
    return { data: { acknowledgedAt } };
  });
  page("/operations/alerts");
  fireEvent.click(await screen.findByRole("button", { name: "Acknowledge alert" }));
  await waitFor(() => expect(testApi.request).toHaveBeenCalledWith({
    method: "post", url: "/workforce/alerts/alert/acknowledge", baseURL: "/api/v1", data: {},
  }));
  expect(await screen.findByText("Acknowledged", { exact: true })).toBeTruthy();
});
