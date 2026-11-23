import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const { prisma } = createRequire(import.meta.url)("../../api/dist/common/database/prisma.js") as
  typeof import("../../api/src/common/database/prisma");

test("performance reports apply workforce scope and display persisted seconds, throughput and live freshness", async ({ page }, info) => {
  test.setTimeout(110000);
  const key = randomUUID().slice(0, 7).toUpperCase();
  const email = process.env.PRAKARO_TEST_ADMIN_EMAIL || "admin@prakaro.app";
  const password = process.env.PRAKARO_TEST_ADMIN_PASSWORD || "PrakaroAdmin123!";
  const headers = { origin: new URL(info.project.use.baseURL!).origin, "X-Prakaro-Console": "1" };
  const browserOrigin = new URL(info.project.use.baseURL!).origin;
  const group = "Analytics Operations " + key;
  const directory = resolve("../../docs/milestone14-phase6-screenshots");

  async function screenshot(name: string, section?: string) {
    if (process.env.PRAKARO_PHASE6_SCREENSHOTS !== "1") return;
    await mkdir(directory, { recursive: true });
    const options = { path: resolve(directory, name + ".png"), animations: "disabled" as const };
    if (section) await page.locator(section).screenshot(options);
    else await page.screenshot(options);
  }
  async function signIn(user: string, platform = false) {
    await page.goto("/login");
    if (platform) await page.getByRole("button", { name: "Super Admin", exact: true }).click();
    await page.locator("input[type=email]").fill(user);
    await page.locator("input[type=password]").fill(password);
    await page.locator("form button[type=submit]").click();
    await expect(page.getByLabel("AUX status")).toBeVisible();
  }
  async function signOut() {
    await page.getByLabel("Account menu").click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
  }
  async function post(path: string, data: object) {
    const result = await page.request.post("/api/v1" + path, { headers, data });
    expect(result.status(), await result.text()).toBe(200);
    return result.json();
  }

  await signIn(email, true);
  const org = await post("/organizations", { name: group, code: "AN-" + key });
  const foreign = await post("/organizations", { name: "Unrelated Analytics " + key, code: "ART-" + key });
  const lob = await post("/lobs", { name: "Verification LOB " + key, code: "ANLOB-" + key });
  await post("/lobs/" + lob.id + "/assign-organization", { organizationId: org.id });
  async function employee(given: string, role: string) {
    return post("/workforce/staff", {
      name: given + " " + key, email: given.toLowerCase() + "." + key.toLowerCase() + "@example.test",
      password, organizationId: org.id, lobId: lob.id, role, status: "ACTIVE", employeeCode: given.toUpperCase() + "-" + key,
    });
  }
  const admin = await employee("Director", "MODERATION_ADMIN");
  const lead = await employee("Supervisor", "MOD_SUPERVISOR");
  const reviewer = await employee("Primary", "MODERATOR");
  const second = await employee("Secondary", "MODERATOR");
  const hidden = await employee("Unassigned", "MODERATOR");
  const team = await prisma.workforceTeam.create({ data: {
    name: "Assigned reviewers " + key, code: "TEAM-" + key, kind: "MODERATION", organizationId: org.id,
  } });
  await prisma.workforceTeamLink.createMany({ data: [
    { teamId: team.id, moderatorId: lead.id, organizationId: org.id, kind: "SUPERVISOR" },
    ...[reviewer, second].map(({ id }) => ({
      teamId: team.id, moderatorId: id, organizationId: org.id, kind: "MEMBER",
    })),
  ] });
  const queue = await prisma.moderationQueue.create({ data: {
    name: "Parking review " + key, code: "ANQ-" + key, kind: "GENERAL", organizationId: org.id,
    config: { rule: { field: "source", value: "REPORT" }, columns: ["code"], form: [], slaHours: 24, qaPercent: 0 },
    createdBy: "analytics-fixture", access: { create: { lobId: lob.id, actorId: "fixture", actorType: "SUPER_ADMIN" } },
  } });

  const now = Date.now();
  const start = new Date(now - 3600000);
  const end = new Date(now - 2000);
  async function seedSession(moderatorId: string) {
    const attendance = await prisma.attendanceSession.create({ data: {
      moderatorId, organizationId: org.id, lobId: lob.id, authSessionId: randomUUID(),
      loginAt: start, startedAt: start, endedAt: end, endReason: "USER_LOGOUT", lastHeartbeatAt: end,
      intervals: { create: { startedAt: start, endedAt: end, state: "MODERATING" } },
    } });
    return prisma.moderationWorkSession.create({ data: {
      moderatorId, queueId: queue.id, startedAt: start, endedAt: end, status: "ENDED", attendanceSessionId: attendance.id,
    } });
  }
  const work = await seedSession(reviewer.id);
  const otherWork = await seedSession(second.id);
  const facility = await prisma.parkingIntelligenceCase.create({ data: {
    displayName: "Synthetic analytics verification fixture", admission: { create: { firstEvent: "analytics-e2e" } },
  } });
  async function createCase(status: string) {
    return prisma.moderationCase.create({ data: {
      code: "CASE-ANA-" + randomUUID(), facilityId: facility.id, category: "REPORT",
      trigger: "REPORT", status, activeKey: status === "QUEUED" ? "ANA-" + key : null,
      tasks: { create: { queueId: queue.id, queueVersion: 1, form: [], deadline: new Date(now + 86400000) } },
    } });
  }
  async function completion(session: typeof work, durationSeconds: number) {
    const item = await createCase("REJECTED");
    const reservedAt = new Date(+end - durationSeconds * 1000);
    const reservation = await prisma.moderationCaseReservation.create({ data: {
      caseId: item.id, moderatorId: session.moderatorId, sessionId: session.id, queueId: queue.id,
      reservedAt, leaseExpiresAt: new Date(+end + 60000), status: "COMPLETED",
    } });
    const decision = await prisma.moderationDecisionVersion.create({ data: {
      caseId: item.id, moderatorId: session.moderatorId, action: "REJECT", reason: "Synthetic fixture only.",
      evidenceIds: [], answers: {}, createdAt: end,
    } });
    await prisma.caseHandlingRecord.create({ data: {
      caseId: item.id, moderatorId: session.moderatorId, queueId: queue.id, sessionId: session.id,
      reservationId: reservation.id, decisionVersionId: decision.id, startedAt: reservedAt, submittedAt: end,
      durationSeconds, action: "REJECT",
    } });
  }
  try {
    await Promise.all([completion(work, 80), completion(work, 80), completion(otherWork, 200)]);
    await createCase("QUEUED");
    await signOut();

    await signIn(lead.email);
    await page.goto("/analytics/teams?timezone=UTC");
    await expect(page.getByRole("heading", { name: "Team analytics", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: team.name, exact: true })).toBeVisible();
    await screenshot("team-analytics");
    await page.getByRole("link", { name: "Workforce analytics", exact: true }).click();
    const workforce = page.getByRole("region", { name: "Performance table" });
    await expect(workforce.getByText(reviewer.name, { exact: true })).toBeVisible();
    await expect(workforce.getByText(hidden.name, { exact: true })).toHaveCount(0);
    const forbidden = await page.request.get("/api/v1/moderation/analytics/moderators/" + hidden.id, { headers });
    expect(forbidden.status()).toBe(403);
    await signOut();

    await signIn(admin.email);
    await page.goto("/analytics?timezone=UTC");
    const metric = (title: string) => page.getByText(title, { exact: true }).locator("..").locator("dd").first();
    await expect(metric("Completed cases")).toHaveText("3");
    await expect(metric("Weighted AHT")).toHaveText("120s");
    await expect(metric("Pending cases")).toHaveText("1");
    const auxPanel = page.getByRole("region", { name: "AUX utilization" });
    const recordedModeratingSeconds = (+end - +start) * 2 / 1000;
    await expect(auxPanel.getByText("Moderating", { exact: true }).locator("..").locator("dd"))
      .toHaveText(recordedModeratingSeconds.toLocaleString("en-US") + "s");
    await screenshot("operations-overview");
    await screenshot("aux-utilization", "section[aria-label='AUX utilization']");
    await screenshot("global-aux-header", ".workspace-header");
    const denied = await page.request.get("/api/v1/moderation/analytics/overview?organizationId=" + foreign.id, { headers });
    expect(denied.status()).toBe(403);
    const fresh = page.getByText(/^Updated \d/);
    const timestamp = await fresh.innerText();
    await expect.poll(() => fresh.innerText(), { timeout: 27000 }).not.toBe(timestamp);
    await page.getByLabel("Date range").selectOption("custom");
    await page.getByLabel("From", { exact: true }).fill("2000-01-01");
    await page.getByLabel("Through", { exact: true }).fill("2000-01-01");
    await expect(metric("Completed cases")).toHaveText("0");
    await expect(metric("Weighted AHT")).toHaveText("Unavailable");
    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(metric("Completed cases")).toHaveText("3");
    await page.getByRole("link", { name: "Organization analytics", exact: true }).click();
    await expect(page.getByRole("button", { name: group, exact: true })).toBeVisible();
    await screenshot("organization-analytics");
    await page.getByRole("link", { name: "LOB analytics", exact: true }).click();
    await expect(page.getByRole("button", { name: lob.name, exact: true })).toBeVisible();
    await screenshot("lob-analytics");
    await page.getByRole("link", { name: "Queue analytics", exact: true }).click();
    await expect(page.getByRole("button", { name: queue.name, exact: true })).toBeVisible();
    await screenshot("queue-analytics");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(browserOrigin + "/analytics?timezone=UTC");
    await expect(metric("Completed cases")).toHaveText("3");
    const aux = page.getByLabel("AUX status");
    const box = await aux.boundingBox();
    expect(box!.x + box!.width / 2).toBeGreaterThan(195);
    expect(box!.y).toBeLessThan(60);
    expect(await page.locator(".workspace-main").evaluate((item) => item.scrollWidth <= item.clientWidth)).toBe(true);
    await screenshot("mobile-analytics");
  } finally {
    await prisma.$disconnect();
  }
});
