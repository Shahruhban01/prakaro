// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { Layout } from "../components/Layout";
const fixture = vi.hoisted(() => ({
  expired: false,
  actor: {
    userId: "synthetic",
    role: "MODERATION_ADMIN",
    organization: "Demo operations",
    lob: "Review",
    name: "Director",
    superAdmin: false,
  },
}));
vi.mock("../api", () => ({
  api: { defaults: { headers: { common: {} } } },
  useData: () => ({ data: fixture.actor }),
}));
vi.mock("../attendanceApi",()=>({useAttendanceControl:()=>({state:{available:false},expired:fixture.expired})}));
afterEach(() => { cleanup(); fixture.expired = false; });
it("keeps AUX in the global header when navigating among scoped organization screens", () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="*" element={<h1>Workforce screen</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const control = screen.getByLabelText("AUX status");
  expect(control.closest("header")).toBeTruthy();
  for (const page of [
    "Organizations",
    "Lines of business",
    "Employees",
    "Teams",
    "Queues",
  ]) {
    fireEvent.click(screen.getByRole("link", { name: page }));
    expect(screen.getByLabelText("AUX status")).toBe(control);
  }
  expect(screen.queryByRole("link", { name: "AI providers" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Audit log" })).toBeNull();
});

it("removes cached staff data and redirects on session expiration", async () => {
  fixture.expired = true;
  const client = new QueryClient();
  client.setQueryData(["private-report"], { report: "private" });
  sessionStorage.setItem("prakaro_auth_token", "obsolete");
  render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<Layout />} />
        <Route path="/login" element={<h1>Sign in</h1>} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>);
  await screen.findByRole("heading", { name: "Sign in" });
  await waitFor(() => expect(client.getQueryData(["private-report"])).toBeUndefined());
  expect(sessionStorage.getItem("prakaro_auth_token")).toBeNull();
});
