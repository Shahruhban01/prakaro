import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";

test("creates an owned queue, routes a report and opens a read-only case as a subscribed moderator", async ({
  page,
}, info) => {
  const email = process.env.PRAKARO_TEST_ADMIN_EMAIL || "admin@prakaro.app";
  const password = process.env.PRAKARO_TEST_ADMIN_PASSWORD || "PrakaroAdmin123!";
  const key = randomUUID().slice(0, 8).toUpperCase();
  const orgName = "Queue Test Organization " + key,
    lobName = "Queue Test LOB " + key;
  const moderatorEmail = "queue-" + key.toLowerCase() + "@example.test";
  const queueName = "Report Review " + key;
  const headers = {
    origin: new URL(info.project.use.baseURL!).origin,
    "X-Prakaro-Console": "1",
  };
  async function mutate(path: string, data: unknown) {
    const result = await page.request.post("/api/v1" + path, { data, headers });
    expect(result.status(), await result.text()).toBe(200);
    return result.json();
  }
  async function login(currentEmail: string, isAdmin = false) {
    await page.goto("/login");
    if (isAdmin)
      await page
        .getByRole("button", { name: "Super Admin", exact: true })
        .click();
    await page.locator("input[type=email]").fill(currentEmail);
    await page.locator("input[type=password]").fill(password);
    await page.locator("form button[type=submit]").click();
    await expect(page.getByLabel("AUX status")).toBeVisible();
  }
  async function capture(file: string) {
    await mkdir(info.outputDir, { recursive: true });
    await page.screenshot({
      path: info.outputPath(file + ".png"),
      animations: "disabled",
    });
  }
  await login(email, true);
  const org = await mutate("/organizations", { code: key, name: orgName });
  const lob = await mutate("/lobs", { code: key, name: lobName });
  await mutate("/lobs/" + lob.id + "/assign-organization", {
    organizationId: org.id,
  });
  await mutate("/workforce/staff", {
    name: "Queue Test Moderator",
    email: moderatorEmail,
    password,
    employeeCode: key,
    organizationId: org.id,
    lobId: lob.id,
    role: "MODERATOR",
    status: "ACTIVE",
  });
  const denied = await mutate("/moderation/queues", {
    organizationId: org.id,
    name: "Private " + key,
    kind: "GENERAL",
    priority: 0,
    capacity: 10,
    config: {
      rule: { field: "source", value: "SEARCH" },
      form: [],
      columns: ["code"],
      slaHours: 12,
      qaPercent: 0,
    },
  });
  await page.goto("/queues/new");
  await page.getByLabel("Owning organization").selectOption({ label: orgName });
  await page.getByLabel("Queue code").fill("Q-" + key);
  await page.getByPlaceholder("e.g. Restricted Access Review").fill(queueName);
  await page.getByRole("checkbox", { name: new RegExp(lobName) }).check();
  await page.getByRole("checkbox", { name: "Accept incoming cases" }).check();
  await page.getByLabel("Condition value").fill("REPORT");
  await page.getByRole("button", { name: "Save Queue", exact: true }).click();
  await expect(page.getByRole("heading", { name: queueName })).toBeVisible();
  const queueId = page.url().split("/").at(-1)!;
  const pending = page.getByText("Pending", { exact: true }).locator("..");
  await expect(pending.getByText("0", { exact: true })).toBeVisible();
  await mutate("/moderation/reports", {
    placeId: "synthetic_" + key,
    category: "WRONG_LOCATION",
  });
  await page.reload();
  await expect(pending.getByText("1", { exact: true })).toBeVisible({
    timeout: 22000,
  });
  await expect(page.getByText("Recent arrivals")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Case arrivals over seven days" }),
  ).toBeVisible();
  await capture("queue-dashboard");
  await page.getByLabel("Account menu").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(moderatorEmail);
  await page
    .getByRole("link", { name: "Available Queues", exact: true })
    .click();
  const card = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: queueName }) });
  await card.getByRole("button", { name: "Subscribe", exact: true }).click();
  await expect(card.getByRole("button", { name: "Unsubscribe" })).toBeVisible();
  await capture("available-queues");
  await page
    .getByRole("link", { name: "My Subscribed Queues", exact: true })
    .first()
    .click();
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  await capture("subscribed-queues");
  await page.getByRole("link", { name: "Moderate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start moderation" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "View cases" }).click();
  await page.getByRole("link", { name: /CASE-/ }).first().click();
  await expect(page.getByText("Read-only view")).toBeVisible();
  await expect(page.getByText("Wrong location", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /submit|claim/i })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("AUX status")).toBeVisible();
  await capture("read-only-case");
  const blocked = await page.request.get(
    "/api/v1/moderation/queues/" + denied.id + "/cases",
  );
  expect(blocked.status()).toBe(403);
  const metrics = await page.request.get(
    "/api/v1/moderation/queues/" + queueId + "/metrics",
  );
  expect((await metrics.json()).pending).toBe(1);
});
