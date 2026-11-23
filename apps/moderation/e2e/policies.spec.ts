import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(import.meta.url);
const { prisma } = require("../../api/dist/common/database/prisma.js") as typeof import("../../api/src/common/database/prisma");
const { createQaFixture } = require("../../api/tests/support/qa-fixture.ts") as typeof import("../../api/tests/support/qa-fixture");

test.use({ viewport: { width: 1440, height: 900 } });
test("publishes versioned policy rules, preserves active reservations and answers clarifications before historical QA", async ({ page, browser, baseURL }) => {
  test.setTimeout(180000);
  page.setDefaultTimeout(15000);
  const fx = await createQaFixture(prisma);
  const name = "Parking incident guidance " + fx.org.code.slice(-8);
  await Promise.all([fx.createCase("Policy North"), fx.createCase("Policy West"), fx.createCase("Policy East")]);
  const screenshotDir = resolve("../../docs/milestone14-phase8-screenshots");
  const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  async function newPage() {
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
    contexts.push(context);
    const result = await context.newPage();
    result.setDefaultTimeout(15000);
    return result;
  }
  async function shot(target: Page, file: string, section?: string) {
    if (process.env.PRAKARO_PHASE8_SCREENSHOTS !== "1") return;
    await mkdir(screenshotDir, { recursive: true });
    const options = { path: resolve(screenshotDir, file + ".png"), animations: "disabled" as const };
    if (section) await target.locator(section).screenshot(options);
    else await target.screenshot(options);
  }
  async function login(target: Page, email: string) {
    await target.goto("/login");
    await target.locator("input[type=email]").fill(email);
    await target.locator("input[type=password]").fill(fx.password);
    await target.locator("form button[type=submit]").click();
    await expect(target.getByLabel("AUX status")).toBeVisible();
  }
  async function publish() {
    await page.getByRole("button", { name: "Submit for review", exact: true }).click();
    await page.getByRole("button", { name: "Publish version", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Publish this policy version?" });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Confirm publication" }).click();
    await expect(page.getByRole("button", { name: "Archive version" })).toBeVisible();
  }
  async function save() {
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByText("Draft saved.", { exact: true })).toBeVisible();
  }
  async function approve(target: Page) {
    await target.locator("#action-select").selectOption("APPROVE");
    await target.getByRole("checkbox", { name: /Confirmed parking/ }).check();
    await target.getByRole("button", { name: /Inspection supports parking/ }).click();
    await target.getByRole("textbox", { name: "Inspection summary", exact: true }).fill("Reviewed the synthetic independent inspection.");
    await target.locator("#reason-input").fill("The supplied inspection confirms facility existence.");
    await target.getByRole("button", { name: "Submit → Next", exact: true }).click();
  }
  try {
    await login(page, fx.director.email);
    const headers = { origin: new URL(baseURL!).origin, "X-Prakaro-Console": "1" };
    const sampling = await page.request.post("/api/v1/moderation/qa/policies", {
      headers, data: { organizationId: fx.org.id, queueId: fx.queue.id, rate: 10000, enabled: true, expectedVersion: 0 },
    });
    expect(sampling.status(), await sampling.text()).toBe(200);

    await page.getByRole("link", { name: "Policies", exact: true }).click();
    await page.getByRole("link", { name: "Create policy", exact: true }).click();
    await page.getByRole("combobox", { name: "Organization", exact: true }).selectOption(fx.org.id);
    await page.getByLabel("Policy name").fill(name);
    await page.getByLabel("Category").fill("Parking evidence");
    await page.getByLabel("Description").fill("Synthetic browser fixture");
    await page.getByRole("button", { name: "Create policy", exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.getByLabel("Draft change summary").fill("Publish initial parking inspection guidance.");
    await page.getByRole("button", { name: "Create draft", exact: true }).click();
    await page.getByLabel("Policy overview").fill("Use current independent inspection evidence to confirm parking.");
    await page.getByRole("button", { name: "Add section", exact: true }).click();
    await page.getByLabel("Section title").fill("Inspection evidence");
    await page.getByLabel("Section guidance").fill("Check the current evidence reference before approving a synthetic case.");
    await shot(page, "policy-editor");
    await page.getByRole("button", { name: "Tags", exact: true }).click();
    await page.getByRole("button", { name: "Add tag", exact: true }).click();
    await page.getByLabel("Tag label").fill("Inspection supports parking");
    await page.getByLabel("Tag ID").fill("supports_parking");
    await page.getByLabel("Required tag").check();
    await shot(page, "tag-configuration");
    await page.getByRole("button", { name: "Review form", exact: true }).click();
    await page.getByRole("button", { name: "Add field", exact: true }).click();
    await page.getByLabel("Field label").fill("Inspection summary");
    await page.getByLabel("Field ID").fill("inspection_summary");
    await page.getByLabel("Required field").check();
    await shot(page, "review-form-builder");
    await page.getByRole("button", { name: "Evidence requirements", exact: true }).click();
    await page.getByRole("button", { name: "Add evidence rule", exact: true }).click();
    await shot(page, "evidence-requirements");
    await page.getByRole("button", { name: "Validate draft", exact: true }).click();
    await expect(page.getByText("Draft validation passed.")).toBeVisible();
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review form definitions" })).toBeVisible();
    await shot(page, "policy-preview");
    await save();
    await publish();
    const policyId = new URL(page.url()).pathname.split("/").at(-1)!;
    const v1 = await prisma.policyVersion.findFirstOrThrow({ where: { policyId, number: 1 } });
    await page.getByRole("link", { name: "Assignments", exact: true }).click();
    await page.getByRole("combobox", { name: "Assignment scope", exact: true }).selectOption("queue");
    await page.getByRole("combobox", { name: "Queue", exact: true }).selectOption(fx.queue.id);
    await page.getByRole("button", { name: "Assign published version", exact: true }).click();
    await expect(page.getByText("Policy assigned.", { exact: true })).toBeVisible();
    await shot(page, "policy-assignment");

    const moderator = await newPage();
    await login(moderator, fx.moderator.email);
    const aux = moderator.getByLabel("AUX status");
    await aux.click();
    await moderator.getByRole("dialog").getByRole("button", { name: "Moderating", exact: true }).click();
    await expect(aux).toContainText("Moderating");
    await moderator.keyboard.press("Escape");
    await moderator.goto("/queues/" + fx.queue.id + "/moderate");
    await moderator.getByRole("button", { name: "Start moderation" }).click();
    const heading = moderator.locator("#case-heading");
    await expect(heading).toContainText("CASE-QA-");
    const firstCase = await heading.innerText();
    const policySummary = moderator.locator("#mw-policy-reference summary");
    await expect(policySummary).toContainText("Version 1");
    await policySummary.click();
    await expect(moderator.getByText("Use current independent inspection evidence to confirm parking.", { exact: true })).toBeVisible();
    await shot(moderator, "pinned-moderation-workspace");
    await moderator.getByText("Policy clarification", { exact: true }).click();
    await moderator.getByRole("textbox", { name: "Question", exact: true }).fill("Can this synthetic inspection support approval?");
    await moderator.getByRole("button", { name: "Ask supervisor" }).click();
    await expect(moderator.getByText("Can this synthetic inspection support approval?", { exact: true })).toBeVisible();
    await shot(moderator, "clarification-request");
    await expect(heading).toHaveText(firstCase);
    await expect(aux).toContainText("Moderating");
    const supervisor = await newPage();
    await login(supervisor, fx.supervisor.email);
    await supervisor.getByRole("link", { name: "Clarifications", exact: true }).click();
    await supervisor.getByRole("link", { name: firstCase, exact: true }).click();
    await supervisor.getByRole("textbox", { name: "Clarification response" }).fill("Use the pinned rule and cite the current independent inspection.");
    await supervisor.getByRole("button", { name: "Send response" }).click();
    await expect(supervisor.getByText("Use the pinned rule and cite the current independent inspection.", { exact: true })).toBeVisible();
    await shot(supervisor, "supervisor-clarification-response");
    await expect(moderator.getByText("Use the pinned rule and cite the current independent inspection.", { exact: true })).toBeVisible({ timeout: 18000 });

    await approve(moderator);
    await expect(heading).toContainText("CASE-QA-");
    await expect(heading).not.toHaveText(firstCase);
    const secondCase = await heading.innerText();
    const original = await prisma.moderationDecisionVersion.findFirstOrThrow({
      where: { moderatorId: fx.moderator.id, pinnedPolicyId: v1.id },
    });
    expect(original.publicationLabelId).toBeTruthy();
    expect(original.policyTags).toEqual(["supports_parking"]);

    await page.getByRole("link", { name: "Versions", exact: true }).click();
    await page.getByRole("combobox", { name: "Start from", exact: true }).selectOption(v1.id);
    await page.getByLabel("Draft change summary").fill("Clarify inspections for future cases.");
    await page.getByRole("button", { name: "Create draft", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Version 2", exact: true })).toBeVisible();
    await page.getByLabel("Policy overview").fill("Version two guidance for future inspection reviews.");
    await save();
    await publish();
    await expect(heading).toHaveText(secondCase);
    await expect(policySummary).toContainText("Version 1");
    await approve(moderator);
    await expect(heading).toContainText("CASE-QA-");
    await expect(heading).not.toHaveText(secondCase);
    await expect(policySummary).toContainText("Version 2");
    await expect(moderator).toHaveURL(/\/moderate$/);

    await page.getByRole("link", { name: "Compare", exact: true }).click();
    await expect(page.getByText("Version two guidance for future inspection reviews.", { exact: true })).toBeVisible();
    await shot(page, "version-comparison");
    await page.goto("/policies");
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    await shot(page, "policy-overview");

    await expect.poll(() => prisma.qaSample.count({ where: { queueId: fx.queue.id, status: "PENDING" } }), { timeout: 20000 }).toBe(2);
    const qa = await newPage();
    await login(qa, fx.auditor.email);
    await qa.goto("/qa");
    await qa.getByRole("button", { name: "Claim next review" }).click();
    await expect(qa.getByRole("heading", { name: "Original decision", exact: true })).toBeVisible();
    await qa.getByText(/Original pinned policy/).click();
    await expect(qa.getByText("Current queue policy differs.", { exact: false })).toBeVisible();
    await expect(qa.getByRole("heading", { name: "Review form definitions" })).toBeVisible();
    await shot(qa, "qa-historical-policy");

    const outsider = await newPage();
    await login(outsider, fx.outsider.email);
    await outsider.goto("/policies/" + policyId);
    await expect(outsider.getByRole("alert")).toContainText("Policy administration access is restricted.");
    await outsider.goto(new URL(qa.url()).pathname);
    await expect(outsider.getByRole("alert")).toContainText("QA record is unavailable.");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Moderation policies" })).toBeVisible();
    expect(await page.locator("body").evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(390);
    const mobileAux = await page.getByLabel("AUX status").boundingBox();
    expect(mobileAux!.x + mobileAux!.width / 2).toBeGreaterThan(195);
    expect(mobileAux!.y).toBeLessThan(60);
    await shot(page, "mobile-policy-management");
    await shot(page, "aux-top-right", "header");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
