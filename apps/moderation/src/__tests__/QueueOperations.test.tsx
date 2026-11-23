import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  QueueCaseView,
  QueueWorklist,
  ModeratePrerequisites,
} from "../pages/QueueOperations";
const fake = vi.hoisted(() => ({ get: vi.fn(), mutate: vi.fn() }));
vi.mock("../api", () => ({
  api: { get: fake.get },
  useData: () => ({ data: { userId: "moderator", lob: "Test LOB" } }),
  useAction: () => ({ mutate: fake.mutate, isPending: false }),
  errorText: () => "Queue access denied.",
  canConfigureQueue: () => false,
}));
beforeEach(() => {
  fake.get.mockReset();
  fake.mutate.mockReset();
});
afterEach(cleanup);
function mount(element: React.ReactElement, path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/available-queues" element={element} />
          <Route path="/my-queues" element={element} />
          <Route path="/queues/:id/moderate" element={element} />
          <Route path="/queues/:id/cases/:caseId" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const metrics = {
  pending: 2,
  inProgress: 0,
  completed: 0,
  completedToday: 0,
  activeModerators: 0,
  subscribedModerators: 1,
  ahtSeconds: null,
};
const queue = {
  id: "test",
  code: "REPORT",
  name: "Test Queue",
  status: "ACTIVE",
  lob: "Test LOB",
  metrics,
};
it("offers self-subscription on the available queue list", async () => {
  fake.get.mockResolvedValue({ data: [{ ...queue, subscribed: false }] });
  mount(<QueueWorklist subscribed={false} />, "/available-queues");
  fireEvent.click(await screen.findByRole("button", { name: "Subscribe" }));
  expect(fake.mutate).toHaveBeenCalledWith({
    url: "/queues/test/subscribe",
    method: "post",
  });
  expect(screen.getByText("Unavailable")).toBeTruthy();
});
it("shows Moderate, View and unsubscribe for a subscribed queue", async () => {
  fake.get.mockResolvedValue({ data: [{ ...queue, subscribed: true }] });
  mount(<QueueWorklist subscribed />, "/my-queues");
  expect(await screen.findByRole("link", { name: "Moderate" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "View" }).getAttribute("href")).toBe(
    "/queues/test/cases",
  );
  fireEvent.click(screen.getByRole("button", { name: "Unsubscribe" }));
  expect(fake.mutate).toHaveBeenCalledWith({
    url: "/queues/test/subscribe",
    method: "delete",
  });
});
it("displays case evidence without mutation actions", async () => {
  fake.get.mockResolvedValue({
    data: {
      code: "CASE-TEST",
      category: "REPORT",
      status: "QUEUED",
      admission: { facility: { evidence: [] } },
      tasks: [],
    },
  });
  mount(<QueueCaseView />, "/queues/test/cases/fixture");
  expect(await screen.findByText("Read-only view")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /claim|submit/i })).toBeNull();
  expect(fake.mutate).not.toHaveBeenCalled();
});
it("denies Moderate when a queue cannot be read", async () => {
  fake.get.mockRejectedValue(new Error("403"));
  mount(<ModeratePrerequisites />, "/queues/test/moderate");
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /start moderation/i }),
  ).toBeNull();
});
