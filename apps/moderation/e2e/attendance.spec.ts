import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
const {prisma}=createRequire(import.meta.url)("../../api/dist/common/database/prisma.js") as typeof import("../../api/src/common/database/prisma");

test("punches AUX across routes and tabs, shows scoped history, and blocks an active lease", async ({
  page,
  context,
}, info) => {
  const key = randomUUID().slice(0, 8).toUpperCase();
  const password = process.env.PRAKARO_TEST_ADMIN_PASSWORD || "PrakaroAdmin123!";
  const platformEmail = process.env.PRAKARO_TEST_ADMIN_EMAIL || "admin@prakaro.app";
  const employeeEmail = "attendance-" + key.toLowerCase() + "@test.example";
  const supervisorEmail = "lead-" + key.toLowerCase() + "@test.example";
  const origin = new URL(info.project.use.baseURL!).origin;
  const headers = { Origin: origin, "X-Prakaro-Console": "1" };
  const aux = page.getByLabel("AUX status");
  const scopeName = "Attendance Employee " + key,
    outsiderName = "Unassigned Employee " + key;
  async function login(email: string, platform = false) {
    await page.goto("/login");
    if (platform)
      await page
        .getByRole("button", { name: "Super Admin", exact: true })
        .click();
    await page.locator("input[type=email]").fill(email);
    await page.locator("input[type=password]").fill(password);
    await page.locator("form button[type=submit]").click();
    await expect(aux).toBeVisible();
  }
  async function signOut() {
    await page.getByLabel("Account menu").click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
  }
  async function mutation(path: string, payload: unknown) {
    const result = await page.request.post("/api/v1" + path, {
      headers,
      data: payload,
    });
    expect(result.status(), await result.text()).toBe(200);
    return result.json();
  }
  async function screenshot(name: string) {
    await mkdir(info.outputDir, { recursive: true });
    await page.screenshot({
      path: info.outputPath(name + ".png"),
      animations: "disabled",
    });
  }
  async function punch(value: string) {
    await aux.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: value, exact: true })
      .click();
    await expect(aux).toContainText(value);
    await page.keyboard.press("Escape");
  }
  await login(platformEmail, true);
  const org = await mutation("/organizations", {
    name: "Attendance Organization " + key,
    code: "A-" + key,
  });
  const lob = await mutation("/lobs", {
    name: "Attendance LOB " + key,
    code: "L-" + key,
  });
  await mutation("/lobs/" + lob.id + "/assign-organization", {
    organizationId: org.id,
  });
  const employee = await mutation("/workforce/staff", {
    name: scopeName,
    email: employeeEmail,
    password,
    role: "MODERATOR",
    status: "ACTIVE",
    organizationId: org.id,
    lobId: lob.id,
    employeeCode: "E-" + key,
  });
  const lead = await mutation("/workforce/staff", {
    name: "Attendance Supervisor " + key,
    email: supervisorEmail,
    password,
    role: "MOD_SUPERVISOR",
    status: "ACTIVE",
    organizationId: org.id,
    lobId: lob.id,
    employeeCode: "S-" + key,
  });
  await mutation("/workforce/staff", {
    name: outsiderName,
    email: "outside-" + key.toLowerCase() + "@test.example",
    password,
    role: "MODERATOR",
    status: "ACTIVE",
    organizationId: org.id,
    lobId: lob.id,
    employeeCode: "O-" + key,
  });
  const team = await mutation("/workforce/teams", {
    name: "Attendance Team " + key,
    code: "T-" + key,
    kind: "MODERATION",
    organizationId: org.id,
  });
  await mutation("/workforce/teams/" + team.id + "/members", {
    staffId: employee.id,
    kind: "MEMBER",
  });
  await mutation("/workforce/teams/" + team.id + "/members", {
    staffId: lead.id,
    kind: "SUPERVISOR",
  });
  const queue = await mutation("/moderation/queues", {
    name: "Attendance Queue " + key,
    organizationId: org.id,
    lobIds: [lob.id],
    kind: "REPORT",
    priority: 0,
    capacity: 20,
    config: {
      rule: { field: "source", value: "REPORT" },
      columns: ["code"],
      form: [],
      slaHours: 48,
      qaPercent: 100,
    },
  });
  await signOut();
  await login(employeeEmail);
  await expect(aux).toContainText("Non-moderating");
  await punch("Moderating");
  const moderating = await (
    await page.request.get("/api/v1/workforce/aux/me")
  ).json();
  expect(moderating.startedAt).toBeTruthy();
  await expect(aux.locator("time")).toHaveText(/^\d\d:\d\d:\d\d$/);
  await mutation("/moderation/queues/" + queue.id + "/subscribe", {});
  await page
    .getByRole("link", { name: "My Subscribed Queues", exact: true })
    .click();
  await expect(aux).toContainText("Moderating");
  await page.goto("/queues/" + queue.id);
  await expect(aux).toContainText("Moderating");
  await punch("Break");
  await page.reload();
  await expect(aux).toContainText("Break");
  const tab = await context.newPage();
  await tab.goto("/my-queues");
  await expect(tab.getByLabel("AUX status")).toContainText("Break");
  await punch("Training");
  await tab.bringToFront();
  await expect(tab.getByLabel("AUX status")).toContainText("Training", {
    timeout: 18000,
  });
  await tab.close();
  await page.bringToFront();
  await page.getByRole("link", { name: "My attendance", exact: true }).click();
  const history = await (
    await page.request.get("/api/v1/workforce/attendance/me/history")
  ).json();
  expect(history.totalSessions).toBe(1);
  expect(
    history.rows[0].intervals.map(
      (interval: { state: string }) => interval.state,
    ),
  ).toEqual(["NON_MODERATING", "MODERATING", "BREAK", "TRAINING"]);
  await page.locator("details.attendance-session > summary").first().click();
  await expect(
    page.getByRole("cell", { name: "Training", exact: true }),
  ).toBeVisible();
  await screenshot("attendance-history");
  await punch("Moderating");
  await page.goto("/queues/" + queue.id + "/moderate");
  await expect(
    page.getByRole("button", { name: "Start moderation" }),
  ).toBeDisabled();
  await expect(page.getByText(/Your AUX is ready/)).toBeVisible();
  const facility = await prisma.parkingIntelligenceCase.create({
    data: {
      googlePlaceId: "phase3-" + key,
      admission: { create: { firstEvent: "synthetic-browser" } },
    },
  });
  const reservation = await prisma.moderationCase.create({
    data: {
      facilityId: facility.id,
      code: "AUX-" + key,
      status: "IN_REVIEW",
      category: "TEST",
      trigger: "TEST",
      owner: employee.id,
      leaseUntil: new Date(Date.now() + 60000),
    },
  });
  try {
    await page.reload();
    await expect(aux).toContainText("Moderating");
    await aux.click();
    await expect(
      page.getByRole("button", { name: "Break", exact: true }),
    ).toBeDisabled();
    const snap = await (
      await page.request.get("/api/v1/workforce/aux/me")
    ).json();
    const direct = await page.request.post("/api/v1/workforce/aux/transition", {
      headers,
      data: {
        state: "BREAK",
        attendanceSessionId: snap.attendanceSessionId,
        version: snap.version,
      },
    });
    expect(direct.status()).toBe(409);
    expect((await direct.json()).error.code).toBe("ACTIVE_CASE");
    const logout = await page.request.post("/api/moderator-auth/sign-out", {
      headers,
      data: {},
    });
    expect(logout.status()).toBe(409);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(aux).toBeVisible();
    await screenshot("mobile-aux-case-lock");
  } finally {
    await prisma.moderationCase.delete({ where: { id: reservation.id } });
    await prisma.searchAdmission.delete({where:{facilityId:facility.id}});
    await prisma.parkingIntelligenceCase.delete({ where: { id: facility.id } });
    await prisma.queueSubscription.deleteMany({ where: { queueId: queue.id } });
    await prisma.queueConfigurationVersion.deleteMany({ where: { queueId: queue.id } });
    await prisma.queueLobAccess.deleteMany({ where: { queueId: queue.id } });
    await prisma.moderationMembership.deleteMany({ where: { queueId: queue.id } });
    await prisma.moderationTask.deleteMany({ where: { queueId: queue.id } });
    await prisma.moderationQueue.delete({ where: { id: queue.id } });
    await prisma.$disconnect();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.keyboard.press("Escape");
  await signOut();
  await login(supervisorEmail);
  await page.getByRole("link", { name: "Workforce AUX", exact: true }).click();
  await expect(page.getByText(scopeName, { exact: true })).toBeVisible();
  await expect(page.getByText(outsiderName, { exact: true })).toHaveCount(0);
  await screenshot("workforce-aux");
});
