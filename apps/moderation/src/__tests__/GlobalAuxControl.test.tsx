// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GlobalAuxControl, formatAht } from "../components/GlobalAuxControl";
afterEach(cleanup);
it("shows all six AUX states and disables punching when attendance is unavailable", () => {
  render(<GlobalAuxControl />);
  fireEvent.click(screen.getByLabelText("AUX status"));
  expect(screen.getByText(/attendance service unavailable/i)).toBeTruthy();
  const labels = [
    "Moderating",
    "Non-moderating",
    "Break",
    "Meeting",
    "Offline",
    "Training",
  ];
  for (const label of labels)
    expect(
      (screen.getByRole("button", { name: label }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
});
it("displays elapsed AUX time and honors the active-case lock", () => {
  const onPunch = vi.fn();
  render(
    <GlobalAuxControl
      state={{
        available: true,
        status: "MODERATING",
        elapsedSeconds: 85,
        locked: true,
      }}
      onPunch={onPunch}
    />,
  );
  fireEvent.click(screen.getByLabelText("AUX status"));
  expect(screen.getAllByText("00:01:25")[0]).toBeTruthy();
  expect(screen.getAllByText(/release your active case/i)[0]).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Break" }));
  expect(onPunch).not.toHaveBeenCalled();
  expect(formatAht(85)).toBe("85s");
});
