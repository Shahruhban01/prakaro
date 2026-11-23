import { expect, test, type Page } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { prisma } = require("../../api/dist/common/database/prisma.js") as typeof import("../../api/src/common/database/prisma");
const { createOperationsFixture } = require("../../api/tests/support/operations-fixture.ts") as typeof import("../../api/tests/support/operations-fixture");

test.use({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
test("manager plans overnight staffing and administrators operate real executive metrics, alerts and exports", async ({ page, browser, baseURL }) => {
  test.setTimeout(180000);
  const f = await createOperationsFixture(prisma);
  const directories = resolve("../../docs/milestone14-phase9-screenshots");
  const today = new Date().toISOString().slice(0,10);
  const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0,10);
  await f.seedIntake(tomorrow);
  const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  const headers = { origin: new URL(baseURL!).origin, "X-Prakaro-Console": "1" };
  async function shot(target: Page, name: string, section?: string) {
    if (process.env.PRAKARO_PHASE9_SCREENSHOTS !== "1") return;
    await mkdir(directories, { recursive: true });
    const options = { path: resolve(directories, name + ".png"), animations: "disabled" as const };
    if (section) await target.locator(section).screenshot(options);
    else await target.screenshot(options);
  }
  async function login(target: Page, email: string, platform = false) {
    target.setDefaultTimeout(15000);
    await target.goto("/login");
    if (platform) await target.getByRole("button", { name: "Super Admin", exact: true }).click();
    await target.locator("input[type=email]").fill(email);
    await target.locator("input[type=password]").fill(platform ? process.env.PRAKARO_TEST_ADMIN_PASSWORD! : f.password);
    await target.locator("form button[type=submit]").click();
    await expect(target.getByLabel("AUX status")).toBeVisible();
  }
  async function staff(email: string, platform = false) {
    const context = await browser.newContext({ baseURL, acceptDownloads: true, viewport: { width: 1440, height: 900 } });
    contexts.push(context);
    const target = await context.newPage(); await login(target, email, platform); return target;
  }
  async function command(target: Page, endpoint: string, data: object) {
    const response = await target.request.post("/api/v1/" + endpoint, { headers, data });
    expect(response.status(), await response.text()).toBe(200);
    return response.json();
  }
  try {
    await login(page, f.supervisor.email);
    await page.goto("/operations/schedule?anchor=" + tomorrow);
    await page.getByText("Shift editor", { exact: true }).click();
    await page.getByLabel("Shift name").fill("Overnight parking verification");
    await page.getByLabel("Local start").fill("22:00");
    await page.getByLabel("Local end").fill("06:00");
    await page.getByLabel("Break minutes").fill("30");
    await shot(page, "shift-editor");
    await page.getByRole("button", { name: "Create shift", exact: true }).click();
    await expect(page.getByText("Shift created.", { exact: true })).toBeVisible();
    const shift = await prisma.workforceShift.findFirstOrThrow({ where: { organizationId: f.org.id } });
    await page.getByText("Assign a shift or exception", { exact: true }).click();
    const assignment = page.locator("details").filter({ hasText: "Assign a shift or exception" });
    await assignment.getByRole("combobox", { name: "Employee", exact: true }).selectOption(f.moderator.id);
    await assignment.getByRole("combobox", { name: "Team", exact: true }).selectOption(f.team.id);
    await assignment.getByRole("combobox", { name: "Shift", exact: true }).selectOption(shift.id);
    await assignment.getByLabel("Schedule reason").fill("Synthetic overnight workload coverage");
    await assignment.getByRole("button", { name: "Assign schedule" }).click();
    await expect(page.getByText("Schedule assigned.", { exact: true })).toBeVisible();
    const calendar = page.locator("#workforce-calendar");
    await expect(calendar.getByText("Overnight parking verification", { exact: true })).toBeVisible();
    await expect(calendar.getByText(/· Overnight$/)).toBeVisible();
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await expect(calendar.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
    await shot(page, "workforce-schedule");
    const next = new Date(Date.parse(tomorrow) + 86400000).toISOString().slice(0,10);
    expect((await prisma.workforceShiftAssignment.findFirstOrThrow({ where: { organizationId: f.org.id } })).endsAt.toISOString().slice(0,10)).toBe(next);

    const dateRange = "?from=" + tomorrow + "&through=" + tomorrow;
    await page.goto("/operations/attendance" + dateRange);
    await expect(page.getByRole("cell", { name: "Not started" })).toBeVisible();
    await shot(page, "attendance-adherence");
    const scope = await page.request.get("/api/v1/workforce/schedules?organizationId=" + f.otherOrg.id);
    expect(scope.status()).toBe(403);
    const other = await page.request.get("/api/v1/workforce/schedules?employeeId=" + f.auditor.id);
    expect(other.status()).toBe(403);

    const admin = await staff(f.director.email);
    await command(admin, "moderation/qa/policies", { organizationId: f.org.id, queueId: f.queue.id, rate: 10000, enabled: true, expectedVersion: 0 });
    const current = new Date();
    await prisma.workforceShiftAssignment.create({ data: {
      organizationId: f.org.id, employeeId: f.moderator.id, lobId: f.line.id, teamId: f.team.id, shiftId: shift.id, kind: "SHIFT",
      startsAt: new Date(+current - 60000), endsAt: new Date(+current + 600000), localDate: today, timezone: "UTC",
      shiftName: "Synthetic current coverage", breakMinutes: 0, earlyGraceMinutes: 0, lateGraceMinutes: 5, reason: "Synthetic attendance overlap",
      createdBy: f.director.id, seriesId: "phase9-browser",
    } });
    await f.createCase("Operations work");
    const moderator = await staff(f.moderator.email);
    const aux = moderator.getByLabel("AUX status");
    await aux.click();
    await moderator.getByRole("dialog").getByRole("button", { name: "Moderating", exact: true }).click();
    await expect(aux).toContainText("Moderating");
    await moderator.keyboard.press("Escape");
    await moderator.goto("/queues/" + f.queue.id + "/moderate");
    await moderator.getByRole("button", { name: "Start moderation" }).click();
    await expect(moderator.locator("#case-heading")).toContainText("CASE-QA");
    await page.goto("/operations/live");
    const liveRow = page.getByRole("row", { name: new RegExp(f.moderator.name) });
    await expect(liveRow).toContainText("Moderating");
    await expect(liveRow).toContainText("Case reserved");
    await shot(page, "live-workforce");
    await moderator.locator("#action-select").selectOption("REJECT");
    await moderator.getByRole("button", { name: "Independent inspection", exact: true }).click();
    await moderator.locator("#reason-input").fill("Synthetic reviewer completed the fixture.");
    await moderator.getByRole("button", { name: "Submit & Leave", exact: true }).click();
    await expect(moderator).not.toHaveURL(/\/moderate$/);
    const committed = await prisma.caseHandlingRecord.findFirstOrThrow({ where: { moderatorId: f.moderator.id } });

    const qa = await staff(f.auditor.email);
    await expect.poll(() => prisma.qaSample.count({ where: { organizationId: f.org.id, status: "PENDING" } }), { timeout: 17000 }).toBe(1);
    const sample = await command(qa, "moderation/qa/reviews/claim-next", {});
    const response = await qa.request.get("/api/v1/moderation/qa/reviews/" + sample.id);
    const review = await response.json();
    await command(qa, "moderation/qa/reviews/" + sample.id + "/start", { version: review.assignmentVersion });
    await command(qa, "moderation/qa/reviews/" + sample.id + "/submit", { version: review.assignmentVersion, assessment: { outcome: "PASS" } });

    await page.goto("/operations/capacity" + dateRange);
    const capacityRow = page.getByRole("row", { name: new RegExp(f.queue.name) });
    await expect(capacityRow).toContainText(committed.durationSeconds + "s");
    await expect(capacityRow).toContainText("Historical weighted");
    await shot(page, "capacity-planning");
    await page.goto("/operations/gaps" + dateRange);
    await expect(page.getByRole("heading", { name: "Staffing gap analysis" })).toBeVisible();
    await page.getByLabel("Scenario utilization (%)").fill("0");
    await page.getByRole("button", { name: "Apply scenario" }).click();
    await expect(capacityRow).toContainText("Coverage gap");
    await page.goto("/operations/forecast" + dateRange);
    await expect(page.getByRole("columnheader", { name: "Matching weekdays" })).toBeVisible();
    await shot(page, "queue-forecast");

    await f.createCase("Pending operations alert");
    await admin.goto("/operations/overview");
    const executive = admin.locator("#executive-overview");
    await expect(executive.getByText("100% · 1 reviews")).toBeVisible();
    await expect(executive.getByText("Pending backlog", { exact: true }).locator("..")).toContainText("1");
    await expect(executive.getByText("Completed cases", { exact: true }).locator("..")).toContainText("1");
    await expect(admin.getByRole("heading", { name: "AUX utilization" })).toBeVisible();
    await shot(admin, "executive-overview");
    const downloadStarted = admin.waitForEvent("download");
    await admin.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadStarted;
    expect(download.suggestedFilename()).toBe("prakaro-executive.csv");
    expect(await readFile((await download.path())!, "utf8")).toContain("AHT seconds");

    await page.goto("/operations/teams?teamId=" + f.team.id);
    await expect(page.getByRole("heading", { name: "Current team roster" })).toBeVisible();
    await expect(page.getByText("Work within recorded team schedules", { exact: false })).toBeVisible();
    await shot(page, "team-performance");

    await admin.goto("/operations/alerts");
    await admin.getByLabel("Queue scope").selectOption(f.queue.id);
    await admin.getByLabel("Threshold", { exact: true }).fill("1");
    await admin.getByRole("button", { name: "Create alert rule" }).click();
    await expect(admin.getByText("Alert rule created.")).toBeVisible();
    await admin.getByRole("button", { name: "Acknowledge alert" }).click({ timeout: 42000 });
    await expect(admin.getByText("Alert acknowledged.")).toBeVisible();
    await shot(admin, "operational-alerts");
    const platform = await staff(process.env.PRAKARO_TEST_ADMIN_EMAIL!, true);
    await platform.goto("/operations/organizations");
    await expect(platform.getByRole("row", { name: new RegExp(f.org.name) })).toBeVisible();
    await shot(platform, "organization-comparison");
    expect((await admin.request.get("/api/v1/moderation/executive/organizations")).status()).toBe(403);
    await admin.setViewportSize({ width: 390, height: 844 });
    await admin.goto("/operations/overview");
    await expect(admin.getByText("Completed cases", { exact: true })).toBeVisible();
    expect(await admin.locator("body").evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(390);
    const bound = await admin.getByLabel("AUX status").boundingBox();
    expect(bound!.x + bound!.width / 2).toBeGreaterThan(195);
    expect(bound!.y).toBeLessThan(60);
    await shot(admin, "mobile-executive-dashboard");
    await shot(admin, "aux-top-right", "header");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
