import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
const password = process.env.PRAKARO_TEST_ADMIN_PASSWORD || "PrakaroAdmin123!";
const platformEmail = process.env.PRAKARO_TEST_ADMIN_EMAIL || "admin@prakaro.app";
test("platform and organization staff use the redesigned workspace", async ({
  page,
}, testInfo) => {
  const code = randomUUID().slice(0, 8).toUpperCase(),
    org = "Synthetic Operations " + code,
    lob = "Synthetic Review " + code;
  const directorEmail = "director-" + code.toLowerCase() + "@example.test";
  const directorName = "Synthetic Director " + code;
  const screenshot = async (name: string) => {
    const path = testInfo.outputPath(name + ".png");
    await mkdir(testInfo.outputDir, { recursive: true });
    await page.screenshot({ path });
    await testInfo.attach(name, { path, contentType: "image/png" });
  };
  async function login(email: string, platform = false) {
    await page.goto("/login");
    if (platform)
      await page
        .getByRole("button", { name: "Super Admin", exact: true })
        .click();
    await page.locator("input[type=email]").fill(email);
    await page.locator("input[type=password]").fill(password);
    await page.locator("form button[type=submit]").click();
    await expect(page.getByLabel("AUX status")).toBeVisible();
  }
  async function navigate(name: string) {
    await page
      .getByRole("navigation")
      .getByRole("link", { name, exact: true })
      .click();
    await expect(page.getByLabel("AUX status")).toBeVisible();
  }
  async function create(label: string, name: string) {
    await page
      .getByRole("button", { name: "Create " + label, exact: true })
      .click();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Code", { exact: true }).fill(code);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const search = page.getByPlaceholder("Search by name");
    if (await search.isVisible()) {
      await search.fill(name);
    }
    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row).toBeVisible();
    return row;
  }
  await login(platformEmail, true);
  await navigate("Organizations");
  await create("organization", org);
  await screenshot("organizations");
  await navigate("Lines of business");
  const lobRow = await create("LOB", lob);
  await lobRow.getByRole("link", { name: "Open" }).click();
  await page
    .getByLabel("Organizations", { exact: true })
    .selectOption({ label: org + " " + code });
  await page.getByRole("button", { name: "Save assignment" }).click();
  await expect(page.getByText(org, { exact: true })).toBeVisible();
  await screenshot("lob-assignment");
  await navigate("Employees");
  await page.getByRole("button", { name: "Create employee" }).click();
  await page.getByLabel("Name", { exact: true }).fill(directorName);
  await page.getByLabel("Employee code", { exact: true }).fill(code);
  await page
    .getByLabel("Organizations", { exact: true })
    .selectOption({ label: org + " " + code });
  await page
    .getByLabel("Lines of business", { exact: true })
    .selectOption({ label: lob + " " + code });
  await page
    .getByLabel("Role", { exact: true })
    .selectOption("MODERATION_ADMIN");
  await page.getByLabel("Email", { exact: true }).fill(directorEmail);
  await page.getByLabel("Initial password").fill(password);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Search by name" }).fill(directorName);
  await expect(page.getByText(directorEmail)).toBeVisible();
  await navigate("Global dashboard");
  await expect(page.getByText("Employee created", {exact:true}).first()).toBeVisible();
  await expect(page.getByRole("img", {name:"Employees by role"})).toBeVisible();
  await screenshot("workforce-dashboard");
  await page.getByLabel("Account menu").click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await login(directorEmail);
  await navigate("Lines of business");
  await expect(page.getByRole("button", { name: "Create LOB" })).toHaveCount(0);
  await expect(page.getByText(lob, { exact: true })).toBeVisible();
  const denied = await page.request.post("/api/v1/lobs", {
    headers: { Origin: new URL(page.url()).origin, "X-Prakaro-Console": "1" },
    data: { name: "Forbidden", code: "FORBIDDEN" },
  });
  expect(denied.status()).toBe(403);
  await navigate("Employees");
  await page.getByRole("button",{name:"Create employee"}).click();
  const member = "Synthetic Reviewer " + code;
  const employeeCode = "M-" + code;
  await page.getByLabel("Name",{exact:true}).fill(member);
  await page.getByLabel("Employee code",{exact:true}).fill(employeeCode);
  await page.getByLabel("Lines of business",{exact:true}).selectOption({label:lob + " " + code});
  await page.getByLabel("Role",{exact:true}).selectOption("QA_REVIEWER");
  await page.getByLabel("Email",{exact:true}).fill("reviewer-"+code.toLowerCase()+"@example.test");
  await page.getByLabel("Initial password").fill(password);
  await page.getByRole("button",{name:"Save",exact:true}).click();
  await expect(page.getByRole("row",{name:new RegExp(member)})).toBeVisible();
  await screenshot("employees");
  await navigate("Teams");
  const teamRow = await create("team", "Synthetic Review Team " + code);
  await teamRow.getByRole("link",{name:"Open"}).click();
  await page.getByLabel("Employees",{exact:true}).selectOption({label:member+" "+employeeCode});
  await page.getByRole("button",{name:"Assign employee"}).click();
  await expect(page.getByRole("row",{name:new RegExp(member)})).toBeVisible();
  await page.getByLabel("AUX status").click();
  await expect(page.getByRole("button", { name: "Non-moderating" })).toBeDisabled();
  await screenshot("organization-teams");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("AUX status")).toBeVisible();
  await screenshot("mobile-header");
});
