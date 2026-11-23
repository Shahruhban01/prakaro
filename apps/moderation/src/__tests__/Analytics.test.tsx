import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Analytics } from "../pages/Analytics";

const api = vi.hoisted(() => ({ get: vi.fn(), actor: { userId: "admin", role: "SUPER_ADMIN", superAdmin: true } }));
vi.mock("../api", () => ({
  api: { get: api.get }, useData: () => ({ data: api.actor }), errorText: (error: Error) => error.message,
}));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: () => <div data-testid="line-chart" />, BarChart: () => <div data-testid="bar-chart" />,
  Bar: () => null, CartesianGrid: () => null, Line: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));

const summary = {
  generatedAt: "2026-11-23T09:32:10Z", timezone: "Asia/Kolkata", from: "2026-11-17", through: "2026-11-23",
  totals: { completed: 12, pending: 5, ahtSeconds: 100, handlingSeconds: 1200, activeModerators: 3,
    activeReservations: 2, casesPerHour: 6, intake: 16, netFlow: 4, sessions: 3, released: 1, expired: 0,
    employees: 4, activeEmployees: 3, lastCompletedAt: "2026-11-23T09:00:00Z" },
  aux: { states: { MODERATING: 7200, BREAK: 1800, OFFLINE: 120 }, eligibleSeconds: 9000, utilization: 0.8 },
  handlingDistribution: { count: 12, min: 40, max: 200, median: 95, p75: 100, p90: 150, p95: 190, mean: 100 },
  quality: { excludedHandling: 1, missingAttribution: 0 },
  hourly: [{ label: "14:00 GMT+5:30", start: "2026-11-23T08:30:00Z", completed: 4, ahtSeconds: 100 }],
  daily: [{ label: "2026-11-23", start: "2026-11-22T18:30:00Z", completed: 12, ahtSeconds: 100 }],
  backlogTrend: null, page: 1, pageSize: 20, totalRows: 1,
  rows: [{ id: "queue", name: "Verification queue", completed: 12, organization: "Example Org", detail: "Active",
    handlingSeconds: 1200, ahtSeconds: 100, pending: 5, intake: 16, released: 1, expired: 0,
    activeReservations: 2, lastCompletedAt: "2026-11-23T09:00:00Z", activeModerators: 3,
    moderatingSeconds: null, casesPerHour: null, sessions: null, presence: null, aux: null,
    attendance: null, currentQueue: null, lastSeen: null }],
  teams: [], queues: [], lobs: [],
  options: { organizations: [], lobs: [], teams: [],
    queues: [{ id: "queue", name: "Verification queue" }], moderators: [] },
};

beforeEach(() => {
  api.get.mockReset();
  api.actor = { userId: "admin", role: "SUPER_ADMIN", superAdmin: true };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function mount(path = "/analytics") {
  return render(<QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={[path]}><Analytics /></MemoryRouter>
  </QueryClientProvider>);
}

it("loads and renders persisted values and accessible chart data in reporting timezone", async () => {
  let resolve!: (result: object) => void;
  api.get.mockReturnValue(new Promise((done) => { resolve = done; }));
  mount();
  expect(screen.getByText("Loading analytics…")).toBeTruthy();
  await act(async () => resolve({ data: summary }));
  expect(await screen.findByText("Operations overview", { selector: "h1" })).toBeTruthy();
  const cards = screen.getByText("Weighted AHT", { selector: "dt" }).closest("dl")!;
  expect(within(cards).getByText("100s")).toBeTruthy();
  expect(screen.getByText("Updated 15:02:10 · Asia/Kolkata")).toBeTruthy();
  expect(screen.getByRole("region", { name: "Performance table" }).textContent).toContain("Verification queue");
  expect(screen.getByText("Verification queue", { selector: "button" })).toBeTruthy();
  expect(screen.getByTestId("line-chart")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Hourly" }));
  expect(screen.getAllByText("14:00 GMT+5:30").length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText("80.0%")).toBeTruthy();
});

it("uses server date and status filters and reflects the selected date preset", async () => {
  api.get.mockResolvedValue({ data: summary });
  mount("/analytics?timezone=Asia%2FKolkata");
  await screen.findByText("Completed cases", { selector: "dt" });
  fireEvent.change(screen.getByLabelText("Date range"), { target: { value: "yesterday" } });
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/analytics/overview",
    expect.objectContaining({ params: expect.objectContaining({ preset: "yesterday", timezone: "Asia/Kolkata" }) })));
  fireEvent.change(screen.getByLabelText("Decision status"), { target: { value: "REJECT" } });
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/analytics/overview",
    expect.objectContaining({ params: expect.objectContaining({ status: "REJECT" }) })));
});

it("distinguishes unavailable durations, empty rows and a recoverable fetch error", async () => {
  api.get.mockRejectedValueOnce(new Error("Report failed")).mockResolvedValue({ data: {
    ...summary, rows: [], daily: [], hourly: [], aux: null,
    totals: { ...summary.totals, pending: null, ahtSeconds: null },
  } });
  mount("/analytics/queues");
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("No records match these filters.")).toBeTruthy();
  expect(within(screen.getByText("Weighted AHT", { selector: "dt" }).closest("dl")!).getByText("Unavailable")).toBeTruthy();
});

it("limits self-only navigation and direct unauthorized links", async () => {
  api.actor = { userId: "operator", role: "MODERATOR", superAdmin: false };
  const mounting = mount("/analytics/teams");
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(api.get).not.toHaveBeenCalled();
  mounting.unmount();
  api.get.mockResolvedValue({ data: summary });
  mount("/analytics/my-performance");
  await screen.findByText("Completed cases", { selector: "dt" });
  expect(api.get.mock.calls[0]?.[0]).toBe("/analytics/moderators/me");
  expect(screen.queryByRole("link", { name: "Team analytics" })).toBeNull();
});

it("polls for updates on the active dashboard", async () => {
  vi.useFakeTimers();
  api.get.mockResolvedValueOnce({ data: summary }).mockResolvedValue({ data: {
    ...summary, generatedAt: "2026-11-23T09:32:30Z", totals: { ...summary.totals, completed: 13 },
  } });
  mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  await act(async () => { await vi.advanceTimersByTimeAsync(20005); });
  expect(api.get.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(screen.getByText(/15:02:30/)).toBeTruthy();
});
