import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const { prisma } = createRequire(import.meta.url)(
  "../../api/dist/common/database/prisma.js",
) as typeof import("../../api/src/common/database/prisma");

test.use({ viewport: { width: 1440, height: 900 } });

test("continuous moderation engine allocates cases randomly, enforces AUX lock, auto-nexts, and records AHT in seconds", async ({
  page,
}, info) => {
  const email = process.env.PRAKARO_TEST_ADMIN_EMAIL || "admin@prakaro.app";
  const password = process.env.PRAKARO_TEST_ADMIN_PASSWORD || "PrakaroAdmin123!";
  const key = randomUUID().slice(0, 8).toUpperCase();
  const orgName = "Continuous Ops " + key;
  const lobName = "Continuous LOB " + key;
  const moderatorEmail = "continuous-" + key.toLowerCase() + "@example.test";
  const queueName = "Continuous Queue " + key;
  const origin = new URL(info.project.use.baseURL!).origin;
  const headers = {
    origin,
    "X-Prakaro-Console": "1",
  };

  async function mutate(path: string, data: unknown) {
    const result = await page.request.post("/api/v1" + path, { data, headers });
    expect(result.status(), await result.text()).toBe(200);
    return result.json();
  }

  async function login(currentEmail: string, isAdmin = false) {
    await page.goto("/login");
    if (isAdmin) {
      await page.getByRole("button", { name: "Super Admin", exact: true }).click();
    }
    await page.locator("input[type=email]").fill(currentEmail);
    await page.locator("input[type=password]").fill(password);
    await page.locator("form button[type=submit]").click();
    await expect(page.getByLabel("AUX status")).toBeVisible();
    if (!isAdmin) {
      await expect(page.getByLabel("AUX status")).toContainText("Non-moderating", { timeout: 15000 });
    }
  }

  async function punch(value: string) {
    const aux = page.getByLabel("AUX status");
    await aux.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: value, exact: true })
      .click();
    await expect(aux).toContainText(value, { timeout: 15000 });
    await page.keyboard.press("Escape");
  }

  async function capture(file: string) {
    await mkdir(info.outputDir, { recursive: true });
    await page.screenshot({
      path: info.outputPath(file + ".png"),
      animations: "disabled",
    });
  }
  async function workspaceShot(name: string, section?: string) {
    if (process.env.PRAKARO_PHASE5_SCREENSHOTS !== "1") return;
    const directory = resolve("../../docs/milestone14-phase5-screenshots");
    await mkdir(directory, { recursive: true });
    const options = { path: resolve(directory, name + ".png"), animations: "disabled" as const };
    if (section) await page.locator(section).screenshot(options);
    else await page.screenshot(options);
  }

  const reviewForm = [{
    key: "review_tag", label: "Policy tag", type: "REASON", required: true,
    options: ["Inspection record", "Report needs clarification"],
  }];
  const independentEvidence = {
    source: "PRAKARO_AUDIT", finding: "CONFIRMED_PARKING", reference: "Synthetic field inspection for browser tests",
    approvedAt: new Date(), expiresAt: new Date(Date.now() + 86400000),
  };

  // 1. Super Admin sets up Org, LOB, Staff Moderator, and Queue
  await login(email, true);
  const org = await mutate("/organizations", { code: "ORG-" + key, name: orgName });
  const lob = await mutate("/lobs", { code: "LOB-" + key, name: lobName });
  await mutate("/lobs/" + lob.id + "/assign-organization", {
    organizationId: org.id,
  });

  const staff = await mutate("/workforce/staff", {
    name: "Continuous Moderator " + key,
    email: moderatorEmail,
    password,
    employeeCode: "MOD-" + key,
    organizationId: org.id,
    lobId: lob.id,
    role: "MODERATOR",
    status: "ACTIVE",
  });

  const queue = await mutate("/moderation/queues", {
    organizationId: org.id,
    lobIds: [lob.id],
    name: queueName,
    kind: "REPORT",
    priority: 100,
    capacity: 25,
    intakeEnabled: true,
    config: {
      rule: { field: "source", value: "REPORT" },
      form: reviewForm,
      reviewPolicy: "Inspect current independent evidence before approving. Document unresolved claims.",
      columns: ["code"],
      slaHours: 24,
      qaPercent: 0,
    },
  });

  // 2. Direct database seeding of 2 test facilities and queued moderation cases
  let case1Id: string | undefined;
  let case2Id: string | undefined;
  let facility1Id: string | undefined;
  let facility2Id: string | undefined;
  let releaseCaseId: string | undefined;

  const qv = Number(queue.version) || 1;
  const facility1 = await prisma.parkingIntelligenceCase.create({
    data: {
      googlePlaceId: "continuous-1-" + key,
      displayName: "Continuous Test Parking North " + key,
      formattedAddress: "100 Innovation Way, Suite " + key,
      admission: { create: { firstEvent: "synthetic-e2e" } },
      evidence: { create: independentEvidence },
    },
  });
  facility1Id = facility1.id;

  const case1 = await prisma.moderationCase.create({
    data: {
      facilityId: facility1.id,
      code: "CASE-C1-" + key,
      status: "QUEUED",
      category: "USER_REPORT_REVIEW",
      trigger: "REPORT",
      activeKey: facility1.id + ":USER_REPORT_REVIEW",
      tasks: {
        create: {
          queueId: queue.id,
          queueVersion: qv,
          form: queue.config,
          deadline: new Date(Date.now() + 86400000),
        },
      },
      metadata: {
        report: {
          category: "WRONG_LOCATION",
          notes: "Report 1: Incorrect parking pin location on map.",
        },
      },
    },
  });
  case1Id = case1.id;

  const facility2 = await prisma.parkingIntelligenceCase.create({
    data: {
      googlePlaceId: "continuous-2-" + key,
      displayName: "Continuous Test Parking South " + key,
      formattedAddress: "200 Technology Ave, Suite " + key,
      admission: { create: { firstEvent: "synthetic-e2e" } },
      evidence: { create: independentEvidence },
    },
  });
  facility2Id = facility2.id;

  const case2 = await prisma.moderationCase.create({
    data: {
      facilityId: facility2.id,
      code: "CASE-C2-" + key,
      status: "QUEUED",
      category: "USER_REPORT_REVIEW",
      trigger: "REPORT",
      activeKey: facility2.id + ":USER_REPORT_REVIEW",
      tasks: {
        create: {
          queueId: queue.id,
          queueVersion: qv,
          form: queue.config,
          deadline: new Date(Date.now() + 86400000),
        },
      },
      metadata: {
        report: {
          category: "PRICE",
          notes: "Report 2: Rates have changed to $6/hour.",
        },
      },
    },
  });
  case2Id = case2.id;

  try {
    // Verify queue received the seeded cases
    const queueCheck = await (
      await page.request.get("/api/v1/moderation/queues/" + queue.id + "/metrics", { headers })
    ).json();
    expect(queueCheck.pending).toBeGreaterThanOrEqual(2);

    await capture("queue-configured");

    // Sign out as Super Admin
    await page.getByLabel("Account menu").click();
    await page.getByRole("button", { name: "Sign out" }).click();

    // 3. Log in as Moderator
    await login(moderatorEmail, false);

    // Subscribe to queue
    await page.getByRole("link", { name: "Available Queues", exact: true }).click();
    const card = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: queueName }) });
    await card.getByRole("button", { name: "Subscribe", exact: true }).click();
    await expect(card.getByRole("button", { name: "Unsubscribe" })).toBeVisible();

    // Navigate to My Subscribed Queues and open Continuous Moderate page
    await page.getByRole("link", { name: "My Subscribed Queues", exact: true }).first().click();
    await page.getByRole("link", { name: "Moderate", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/queues/${queue.id}/moderate`));

    // 4. Verify initial AUX prerequisite: disabled when AUX is not MODERATING
    const startBtn = page.getByRole("button", { name: "Start moderation" });
    await expect(startBtn).toBeDisabled();
    await expect(
      page.getByText(/Punch Moderating in the header/),
    ).toBeVisible();

    // 5. Punch MODERATING AUX
    await punch("Moderating");
    await expect(page.getByLabel("AUX status")).toContainText("Moderating");

    // Button should now be enabled
    await expect(startBtn).toBeEnabled();
    await capture("pre-moderation-ready");

    // 6. Start continuous moderation
    await startBtn.click();

    // Verify continuous workspace loaded with active reservation
    const timerBadge = page.locator('[data-testid="case-timer"]');
    await expect(timerBadge).toBeVisible();
    await expect(timerBadge).toHaveText(/^\d+s$/);
    await expect(page.getByText("IN REVIEW")).toBeVisible();
    await expect(page.getByRole("heading", { name: /^CASE-C/ })).toBeVisible();
    await capture("active-case-1");
    await workspaceShot("desktop-workspace");
    await expect(page.getByText("Synthetic field inspection for browser tests")).toBeVisible();
    await workspaceShot("evidence-panel", "section[aria-labelledby=evidence-heading]");
    const firstCase = await page.getByRole("heading", { name: /^CASE-C/ }).innerText();
    const firstId = firstCase === case1.code ? case1.id : case2.id;
    const initialAUX = await page.getByLabel("AUX status").locator("time").innerText();

    // 7. Verify AUX lock while holding active reservation
    await page.reload();
    await expect(page.getByRole("heading", { name: firstCase })).toBeVisible();
    const auxMenu = page.getByLabel("AUX status");
    await auxMenu.click();
    const breakBtn = page.getByRole("dialog").getByRole("button", { name: "Break", exact: true });
    await expect(breakBtn).toBeDisabled();
    await workspaceShot("aux-locked");

    // Direct transition API must also reject with 409 ACTIVE_CASE
    const auxMe = await (await page.request.get("/api/v1/workforce/aux/me", { headers })).json();
    const lockedTransition = await page.request.post("/api/v1/workforce/aux/transition", {
      headers,
      data: {
        state: "BREAK",
        attendanceSessionId: auxMe.attendanceSessionId,
        version: auxMe.version,
      },
    });
    expect(lockedTransition.status()).toBe(409);
    expect((await lockedTransition.json()).error?.code).toBe("ACTIVE_CASE");

    // Direct sign-out must also reject with 409 ACTIVE_CASE
    const lockedSignOut = await page.request.post("/api/moderator-auth/sign-out", {
      headers,
      data: {},
    });
    expect(lockedSignOut.status()).toBe(409);
    await page.keyboard.press("Escape");

    // Workspace remains usable at mobile/tablet widths and the AUX timer stays in the header.
    for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await expect(timerBadge).toBeVisible();
      const sidebar = page.getByLabel("AUX status");
      await expect(sidebar.locator("time")).toBeVisible();
      const auxBox = await sidebar.boundingBox();
      expect(auxBox!.x + auxBox!.width / 2).toBeGreaterThan(width / 2);
      expect(auxBox!.y).toBeLessThan(60);
      const main = page.locator(".workspace-main");
      expect(await main.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      const actions = page.getByLabel("Moderation actions");
      const actionsBox = await actions.boundingBox();
      expect(actionsBox!.y + actionsBox!.height).toBeLessThanOrEqual(height);
    }
    await workspaceShot("mobile-workspace");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("#case-heading").focus();
    await page.keyboard.press("Alt+Shift+KeyD");
    await expect(page.locator("#action-select")).toBeFocused();
    await page.locator("#action-select").selectOption("APPROVE");
    await page.getByRole("checkbox", { name: /Confirmed parking/ }).check();
    await page.getByRole("searchbox", { name: "Search Policy tag" }).fill("inspection");
    await page.getByRole("button", { name: "Inspection record" }).click();
    await page.locator("#reason-input").fill("Synthetic field inspection supports facility existence.");
    await workspaceShot("policy-and-decision");
    await workspaceShot("sticky-action-bar", ".mw-action-bar");
    const submit = page.getByRole("button", { name: "Submit → Next" });
    await page.route("**/reservations/*/submit", (route) => route.abort("internetdisconnected"), { times: 1 });
    await submit.click();
    await expect(page.getByRole("alert").getByText("Connection interrupted")).toBeVisible();
    await expect(page.locator("#reason-input")).toHaveValue("Synthetic field inspection supports facility existence.");

    let permitSubmit!: () => void;
    const gate = new Promise<void>((done) => { permitSubmit = done; });
    await page.route("**/reservations/*/submit", async (route) => {
      await gate;
      await route.continue();
    }, { times: 1 });
    await submit.click();
    try {
      await expect(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
      await workspaceShot("submit-loading");
    } finally {
      permitSubmit();
    }

    // 9. Verify transition to next case in same session without page reload
    await expect(page.getByText("Session Completed: 1")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: firstCase })).toHaveCount(0);
    await expect(timerBadge).toHaveText(/^[0-5]s$/);
    await expect(page.locator("#reason-input")).toHaveValue("");
    await expect(page.locator("#action-select")).toHaveValue("");
    await expect(page).toHaveURL(new RegExp(`/queues/${queue.id}/moderate`));
    const currentAUX = await page.getByLabel("AUX status").locator("time").innerText();
    expect(currentAUX >= initialAUX).toBe(true);
    const prior = await prisma.moderationDecisionVersion.findFirst({ where: { caseId: firstId } });
    expect(prior?.policyVersion).toBe(qv);
    expect(prior?.answers).toEqual({ review_tag: "Inspection record" });
    expect(await prisma.parkingHumanLabel.count({
      where: { caseId: firstId === case1.id ? facility1.id : facility2.id, decision: "CONFIRM_PARKING" },
    })).toBe(1);
    await expect(page.getByLabel("AUX status").locator(".lucide-lock-keyhole")).toBeVisible();
    await capture("active-case-2");

    // Force an actual server-side lease expiry and confirm stale submission is blocked.
    const active = await prisma.moderationCaseReservation.findFirstOrThrow({
      where: { queueId: queue.id, status: "ACTIVE" },
    });
    await prisma.moderationCaseReservation.update({
      where: { id: active.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) },
    });
    const stale = await page.request.post(`/api/v1/moderation/reservations/${active.id}/submit`, {
      headers, data: { action: "REJECT", reason: "Synthetic stale decision", answers: { review_tag: "Inspection record" } },
    });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).error?.code).toBe("LEASE_EXPIRED");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Case lease expired" })).toBeVisible();
    await workspaceShot("lease-expired");
    await page.getByRole("button", { name: "Request another case" }).click();
    await expect(page.getByRole("heading", { name: /^CASE-C/ })).toBeVisible();

    // 10. Submit second case with "Submit & Leave".
    await page.locator("#action-select").selectOption("REJECT");
    await page.getByRole("button", { name: "Report needs clarification" }).click();
    await page.locator("#reason-input").fill("The synthetic report lacks support for the reported change.");
    await page.getByRole("button", { name: "Submit & Leave" }).click();

    // Should navigate back to /my-queues
    await expect(page).toHaveURL(/\/my-queues/);
    await expect(page.getByText("Moderation session ended. Completed cases: 2.")).toBeVisible();
    await expect(page.getByRole("heading", { name: queueName })).toBeVisible();
    await workspaceShot("completed-session");
    await capture("session-completed-my-queues");

    const finalRecords = await prisma.caseHandlingRecord.findMany({ where: { queueId: queue.id } });
    const totalSeconds = finalRecords.reduce((sum, item) => sum + item.durationSeconds, 0);
    await page.getByRole("link", { name: "My performance", exact: true }).click();
    await expect(page.getByRole("heading", { name: "My performance", exact: true })).toBeVisible();
    const performanceMetric = (title: string) => page.getByText(title, { exact: true }).locator("..").locator("dd").first();
    await expect(performanceMetric("Completed cases")).toHaveText("2");
    await expect(performanceMetric("Weighted AHT")).toHaveText(`${Math.round(totalSeconds / 2 * 10) / 10}s`);
    await expect(performanceMetric("Total handling")).toHaveText(`${totalSeconds}s`);
    if (process.env.PRAKARO_PHASE6_SCREENSHOTS === "1") {
      const directory = resolve("../../docs/milestone14-phase6-screenshots");
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: resolve(directory, "moderator-performance.png"), animations: "disabled" });
    }
    await page.goto("/my-queues");

    // 11. Verify AUX is now unlocked after session ended
    const auxMeAfter = await (await page.request.get("/api/v1/workforce/aux/me", { headers })).json();
    const unlockedTransition = await page.request.post("/api/v1/workforce/aux/transition", {
      headers,
      data: {
        state: "NON_MODERATING",
        attendanceSessionId: auxMeAfter.attendanceSessionId,
        version: auxMeAfter.version,
      },
    });
    expect(unlockedTransition.status()).toBe(200);

    // 12. Verify queue AHT in seconds
    const queueMetrics = await (
      await page.request.get(`/api/v1/moderation/queues/${queue.id}/metrics`, { headers })
    ).json();
    expect(typeof queueMetrics.ahtSeconds === "number" || queueMetrics.ahtSeconds === null).toBe(true);

    const queueAht = await (
      await page.request.get(`/api/v1/moderation/queues/${queue.id}/aht`, { headers })
    ).json();
    expect(typeof queueAht.ahtSeconds === "number").toBe(true);
    expect(queueAht.ahtSeconds).toBeGreaterThanOrEqual(0);

    // Read-only View never allocates a reservation or creates a decision.
    const count = await prisma.moderationCaseReservation.count({ where: { queueId: queue.id } });
    await page.getByRole("link", { name: "View", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/queues/${queue.id}/cases`));
    expect(await prisma.moderationCaseReservation.count({ where: { queueId: queue.id } })).toBe(count);

    const releaseCase = await prisma.moderationCase.create({ data: {
      facilityId: facility1.id, code: "CASE-RELEASE-" + key, status: "QUEUED", category: "USER_REPORT_REVIEW",
      trigger: "REPORT", activeKey: facility1.id + ":SYNTHETIC_CASE",
      tasks: { create: { queueId: queue.id, queueVersion: qv, form: queue.config, deadline: new Date(Date.now() + 86400000) } },
    } });
    releaseCaseId = releaseCase.id;
    await page.goto(`/queues/${queue.id}/moderate`);
    await expect(page.getByLabel("AUX status")).toContainText("Non-moderating");
    await punch("Moderating");
    await expect(startBtn).toBeEnabled();
    await startBtn.click();
    await page.getByRole("button", { name: "Release & Leave" }).click();
    await expect(page.getByRole("dialog", { name: "Release this case?" })).toBeVisible();
    await page.getByRole("button", { name: "Release and leave" }).click();
    await expect(page).toHaveURL(/\/my-queues/);
    expect((await prisma.moderationCase.findUnique({ where: { id: releaseCase.id } }))?.status).toBe("QUEUED");
    expect(await prisma.caseHandlingRecord.count({ where: { caseId: releaseCase.id } })).toBe(0);

    await page.getByRole("link", { name: "Moderate", exact: true }).click();
    await expect(startBtn).toBeEnabled();
    await startBtn.click();
    await page.locator("#action-select").selectOption("REJECT");
    await page.getByRole("button", { name: "Inspection record" }).click();
    await page.locator("#reason-input").fill("No additional claim to publish for this synthetic fixture.");
    await submit.click();
    await expect(page.getByRole("heading", { name: "No pending cases are currently available." })).toBeVisible();
    await workspaceShot("empty-queue");
    await page.getByRole("button", { name: "Leave Session" }).click();
    await expect(page).toHaveURL(/\/my-queues/);
  } finally {
    // Cleanup seeded records
    await prisma.caseHandlingRecord.deleteMany({ where: { queueId: queue.id } }).catch(() => {});
    await prisma.moderationCaseReservation.deleteMany({ where: { queueId: queue.id } }).catch(() => {});
    await prisma.moderationWorkSession.deleteMany({ where: { queueId: queue.id } }).catch(() => {});
    await prisma.moderationTask.deleteMany({ where: { queueId: queue.id } }).catch(() => {});
    const caseIds = [case1Id, case2Id, releaseCaseId].filter((id): id is string => Boolean(id));
    const facIds = [facility1Id, facility2Id].filter((id): id is string => Boolean(id));
    if (caseIds.length) {
      await prisma.moderationDecisionVersion.deleteMany({ where: { caseId: { in: caseIds } } }).catch(() => {});
      await prisma.moderationCase.deleteMany({ where: { id: { in: caseIds } } }).catch(() => {});
    }
    if (facIds.length) {
      await prisma.searchAdmission.deleteMany({ where: { facilityId: { in: facIds } } }).catch(() => {});
      await prisma.parkingIntelligenceCase.deleteMany({ where: { id: { in: facIds } } }).catch(() => {});
    }
    await prisma.queueSubscription.deleteMany({ where: { queueId: queue.id } }).catch(() => {});
    await prisma.queueConfigurationVersion.deleteMany({ where: { queueId: queue.id } }).catch(() => {});
    await prisma.queueLobAccess.deleteMany({ where: { queueId: queue.id } }).catch(() => {});
    await prisma.moderationQueue.delete({ where: { id: queue.id } }).catch(() => {});
    await prisma.$disconnect();
  }
});
