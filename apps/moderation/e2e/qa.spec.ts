import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const { prisma } = createRequire(import.meta.url)("../../api/dist/common/database/prisma.js") as
  typeof import("../../api/src/common/database/prisma");
const { createQaFixture } = createRequire(import.meta.url)("../../api/tests/support/qa-fixture.ts") as
  typeof import("../../api/tests/support/qa-fixture");

test.use({ viewport: { width: 1440, height: 900 } });

test("published moderation decisions flow through QA, a dispute and a versioned correction", async ({ page }) => {
  test.setTimeout(145000);
  page.setDefaultTimeout(12000);
  const fixture = await createQaFixture(prisma);
  await Promise.all([fixture.createCase("North"), fixture.createCase("South")]);
  const screenshotDir = resolve("../../docs/milestone14-phase7-screenshots");
  async function shot(name: string, section?: string) {
    if (process.env.PRAKARO_PHASE7_SCREENSHOTS !== "1") return;
    await mkdir(screenshotDir, { recursive: true });
    const options = { path: resolve(screenshotDir, name + ".png"), animations: "disabled" as const };
    if (section) await page.locator(section).screenshot(options);
    else await page.screenshot(options);
  }
  async function login(email: string) {
    await page.goto("/login");
    await page.locator("input[type=email]").fill(email);
    await page.locator("input[type=password]").fill(fixture.password);
    await page.locator("form button[type=submit]").click();
    await expect(page.getByLabel("AUX status")).toBeVisible();
  }
  async function logout() {
    await page.getByLabel("Account menu").click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
  }
  async function decide(button: string) {
    await page.locator("#action-select").selectOption("APPROVE");
    await page.getByRole("checkbox", { name: /Confirmed parking/ }).check();
    await page.getByRole("button", { name: "Independent inspection", exact: true }).click();
    await page.locator("#reason-input").fill("The synthetic inspection supports facility existence.");
    await page.getByRole("button", { name: button, exact: true }).click();
  }

  await login(fixture.director.email);
  await page.goto("/qa/policies");
  const policyScope = page.getByRole("combobox", { name: "Policy scope", exact: true });
  await policyScope.selectOption("queue");
  await expect(policyScope).toHaveValue("queue");
  await page.getByRole("combobox", { name: "Queue", exact: true }).selectOption(fixture.queue.id);
  await page.getByLabel("Sampling rate (%)").fill("100");
  await page.getByLabel("Enable sampling").check();
  await page.getByRole("button", { name: "Save policy version" }).click();
  await expect(page.getByText("Sampling policy version saved.")).toBeVisible();
  await logout();

  await login(fixture.moderator.email);
  const aux = page.getByLabel("AUX status");
  await aux.click();
  await page.getByRole("dialog").getByRole("button", { name: "Moderating", exact: true }).click();
  await expect(aux).toContainText("Moderating");
  await page.keyboard.press("Escape");
  await page.goto("/queues/" + fixture.queue.id + "/moderate");
  await page.getByRole("button", { name: "Start moderation" }).click();
  const caseHeading = page.locator("#case-heading");
  await expect(caseHeading).toContainText("CASE-QA-");
  const originalCode = await caseHeading.innerText();
  await decide("Submit → Next");
  await expect(caseHeading).toContainText("CASE-QA-");
  await expect(caseHeading).not.toHaveText(originalCode);
  await expect(page).toHaveURL(/\/moderate$/);
  const firstDecision = await prisma.moderationDecisionVersion.findFirstOrThrow({
    where: { moderatorId: fixture.moderator.id }, orderBy: { createdAt: "asc" },
  });
  expect(firstDecision.publicationLabelId).toBeTruthy();
  expect(firstDecision.qaSnapshot).toBeTruthy();
  await decide("Submit & Leave");
  await expect(page).not.toHaveURL(/\/moderate$/);
  await expect.poll(() => prisma.qaSample.count({ where: { queueId: fixture.queue.id, status: "PENDING" } })).toBe(2);
  await logout();

  await login(fixture.director.email);
  await page.goto("/qa");
  await expect(page.getByText("2 sampled / 2 eligible", { exact: true })).toBeVisible();
  await expect(aux.locator("time")).toBeVisible();
  await shot("qa-overview");
  await logout();

  await login(fixture.auditor.email);
  await page.goto("/qa");
  await expect(page.getByRole("heading", { name: "Quality assurance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "QA worklist" })).toBeVisible();
  await expect(page.getByRole("row", { name: /CASE-QA-/ }).first()).toBeVisible();
  await shot("qa-worklist", ".qa-worklist");
  await page.getByRole("button", { name: "Claim next review" }).click();
  await expect(page.getByRole("heading", { name: "Original decision", exact: true })).toBeVisible();
  await expect(page.getByText(/Synthetic independent inspection/).first()).toBeVisible();
  await shot("qa-review");
  await shot("original-decision", "section[aria-labelledby='original-decision']");
  await page.getByRole("button", { name: "Start review" }).click();
  await page.getByRole("radio", { name: "QA Pass" }).check();
  await page.getByRole("button", { name: "Submit QA assessment" }).click();
  await expect(page.getByText("QA assessment recorded.")).toBeVisible();
  await shot("qa-pass");

  await page.getByRole("link", { name: "Overview and worklist" }).click();
  await page.getByRole("button", { name: "Claim next review" }).click();
  await page.getByRole("button", { name: "Start review" }).click();
  await page.getByRole("radio", { name: "QA Fail" }).check();
  await page.getByRole("button", { name: "Submit QA assessment" }).click();
  await expect(page.getByLabel("Error category")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Error category").selectOption("UNSUPPORTED_VERIFICATION");
  await page.getByLabel("Severity").selectOption("MAJOR");
  await page.getByLabel("Policy reference").fill("QA-1, independent evidence");
  await page.getByLabel("Explanation").fill("The synthetic second inspection requires further corroboration.");
  await page.getByLabel("Proposed outcome").selectOption("REJECT");
  await page.getByRole("button", { name: "Submit QA assessment" }).click();
  await expect(page.getByText("QA assessment recorded.")).toBeVisible();
  await shot("qa-fail");
  const reviewPath = new URL(page.url()).pathname;
  const failed = await prisma.qaSample.findUniqueOrThrow({
    where: { id: reviewPath.split("/").at(-1) }, include: { decision: { include: { case: true } } },
  });
  const originalLabel = failed.decision.publicationLabelId!;
  expect(originalLabel).toBeTruthy();
  await logout();

  await login(fixture.moderator.email);
  await page.goto(reviewPath);
  await page.getByRole("button", { name: "Open dispute" }).click();
  await page.getByLabel("Dispute reason").fill("Please compare this decision with the frozen evidence.");
  await shot("qa-dispute");
  await page.getByRole("button", { name: "Submit dispute" }).click();
  await expect(page.getByText("Dispute opened.")).toBeVisible();
  await logout();

  await login(fixture.supervisor.email);
  await page.goto(reviewPath);
  await page.getByLabel("Adjudication reason").fill("The original evidence remains insufficient for the published claim.");
  await shot("supervisor-adjudication");
  await page.getByRole("button", { name: "Record adjudication" }).click();
  await page.getByLabel("Correction reason").fill("Withdraw the synthetic claim pending corroborating evidence.");
  await page.getByRole("button", { name: "Recommend correction" }).click();
  await page.getByRole("button", { name: "Start correction" }).click();
  await page.getByRole("button", { name: "Approve correction" }).click();
  await expect(page.getByText(/^Correction committed ·/)).toBeVisible();
  await shot("correction");
  expect((await prisma.parkingHumanLabel.findUniqueOrThrow({ where: { id: originalLabel } })).decision).toBe("CONFIRM_PARKING");
  expect(await prisma.parkingHumanLabel.count({
    where: { caseId: failed.decision.case.facilityId, decision: "NEEDS_EVIDENCE" },
  })).toBe(1);
  expect(await prisma.caseHandlingRecord.count({ where: { moderatorId: fixture.moderator.id } })).toBe(2);
  await page.getByRole("link", { name: "Quality analytics" }).click();
  await expect(page.getByRole("heading", { name: "Quality analytics" })).toBeVisible();
  await expect(page.getByRole("row", { name: /50%/ })).toBeVisible();
  await shot("qa-analytics");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(reviewPath);
  await expect(page.getByRole("heading", { name: "Original decision", exact: true })).toBeVisible();
  await expect(aux.locator("time")).toBeVisible();
  expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(390);
  const auxBox = await aux.boundingBox();
  expect(auxBox!.x + auxBox!.width / 2).toBeGreaterThan(195);
  expect(auxBox!.y).toBeLessThan(60);
  await shot("mobile-qa");
  await shot("aux-header", "header");
  await logout();

  await login(fixture.outsider.email);
  await page.goto(reviewPath);
  await expect(page.getByRole("alert")).toContainText("QA record is unavailable.");
});
