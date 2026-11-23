import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { prisma } = require("../../api/dist/common/database/prisma.js") as typeof import("../../api/src/common/database/prisma");
const { createOperationsFixture } = require("../../api/tests/support/operations-fixture.ts") as typeof import("../../api/tests/support/operations-fixture");

test("tenant boundaries and revoked staff sessions hold in the console", async ({ page }, info) => {
  const capture = async (name: string) => {
    await mkdir(info.outputDir, { recursive: true });
    const path = info.outputPath(name + ".png");
    await page.screenshot({ path });
    await info.attach(name, { path, contentType: "image/png" });
  };
  const url = new URL(process.env.DATABASE_URL ?? "");
  expect(url.hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
  expect(url.pathname).toMatch(/test/);
  const own = await createOperationsFixture(prisma);
  const other = await createOperationsFixture(prisma);
  await page.goto("/login");
  await page.locator("input[type=email]").fill(own.supervisor.email);
  await page.locator("input[type=password]").fill(own.password);
  await page.locator("form button[type=submit]").click();
  await expect(page.getByLabel("AUX status")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("AUX status")).toBeVisible();
  await capture("staff-mobile-session");

  const denied = await page.request.get("/api/v1/moderation/reports/export?report=executive&organizationId=" + other.org.id);
  expect(denied.status()).toBe(403);
  expect(await denied.text()).not.toContain(other.org.name);

  await prisma.moderatorSession.updateMany({ where: { userId: own.supervisor.id },
    data: { expiresAt: new Date(Date.now() - 60_000) } });
  const expired = await page.request.get("/api/v1/moderation/session");
  expect(expired.status()).toBe(401);
  await expect(page).toHaveURL(/\/login$/, { timeout: 20000 });
  await expect(page.getByLabel("AUX status")).toHaveCount(0);
  await capture("expired-session");
});
