# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: apps\moderation\e2e\queues.spec.ts >> creates an owned queue, routes a report and opens a read-only case as a subscribed moderator
- Location: apps\moderation\e2e\queues.spec.ts:5:1

# Error details

```
TypeError: Invalid URL
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | import { randomUUID } from "node:crypto";
  3   | import { mkdir } from "node:fs/promises";
  4   | 
  5   | test("creates an owned queue, routes a report and opens a read-only case as a subscribed moderator", async ({
  6   |   page,
  7   | }, info) => {
  8   |   const email = process.env.PRAKARO_TEST_ADMIN_EMAIL ?? "";
  9   |   const password = process.env.PRAKARO_TEST_ADMIN_PASSWORD ?? "";
  10  |   const key = randomUUID().slice(0, 8).toUpperCase();
  11  |   const orgName = "Queue Test Organization " + key,
  12  |     lobName = "Queue Test LOB " + key;
  13  |   const moderatorEmail = "queue-" + key.toLowerCase() + "@example.test";
  14  |   const queueName = "Report Review " + key;
  15  |   const headers = {
> 16  |     origin: new URL(info.project.use.baseURL!).origin,
      |             ^ TypeError: Invalid URL
  17  |     "X-Prakaro-Console": "1",
  18  |   };
  19  |   async function mutate(path: string, data: unknown) {
  20  |     const result = await page.request.post("/api/v1" + path, { data, headers });
  21  |     expect(result.status(), await result.text()).toBe(200);
  22  |     return result.json();
  23  |   }
  24  |   async function login(currentEmail: string, isAdmin = false) {
  25  |     await page.goto("/login");
  26  |     if (isAdmin)
  27  |       await page
  28  |         .getByRole("button", { name: "Super Admin", exact: true })
  29  |         .click();
  30  |     await page.locator("input[type=email]").fill(currentEmail);
  31  |     await page.locator("input[type=password]").fill(password);
  32  |     await page.locator("form button[type=submit]").click();
  33  |     await expect(page.getByLabel("AUX status")).toBeVisible();
  34  |   }
  35  |   async function capture(file: string) {
  36  |     await mkdir(info.outputDir, { recursive: true });
  37  |     await page.screenshot({
  38  |       path: info.outputPath(file + ".png"),
  39  |       animations: "disabled",
  40  |     });
  41  |   }
  42  |   await login(email, true);
  43  |   const org = await mutate("/organizations", { code: key, name: orgName });
  44  |   const lob = await mutate("/lobs", { code: key, name: lobName });
  45  |   await mutate("/lobs/" + lob.id + "/assign-organization", {
  46  |     organizationId: org.id,
  47  |   });
  48  |   await mutate("/workforce/staff", {
  49  |     name: "Queue Test Moderator",
  50  |     email: moderatorEmail,
  51  |     password,
  52  |     employeeCode: key,
  53  |     organizationId: org.id,
  54  |     lobId: lob.id,
  55  |     role: "MODERATOR",
  56  |     status: "ACTIVE",
  57  |   });
  58  |   const denied = await mutate("/moderation/queues", {
  59  |     organizationId: org.id,
  60  |     name: "Private " + key,
  61  |     kind: "GENERAL",
  62  |     priority: 0,
  63  |     capacity: 10,
  64  |     config: {
  65  |       rule: { field: "source", value: "SEARCH" },
  66  |       form: [],
  67  |       columns: ["code"],
  68  |       slaHours: 12,
  69  |       qaPercent: 0,
  70  |     },
  71  |   });
  72  |   await page.goto("/queues/new");
  73  |   await page.getByLabel("Owning organization").selectOption({ label: orgName });
  74  |   await page.getByLabel("Queue code").fill("Q-" + key);
  75  |   await page.getByPlaceholder("e.g. Restricted Access Review").fill(queueName);
  76  |   await page.getByRole("checkbox", { name: new RegExp(lobName) }).check();
  77  |   await page.getByRole("checkbox", { name: "Accept incoming cases" }).check();
  78  |   await page.getByLabel("Condition value").fill("REPORT");
  79  |   await page.getByRole("button", { name: "Save Queue", exact: true }).click();
  80  |   await expect(page.getByRole("heading", { name: queueName })).toBeVisible();
  81  |   const queueId = page.url().split("/").at(-1)!;
  82  |   const pending = page.getByText("Pending", { exact: true }).locator("..");
  83  |   await expect(pending.getByText("0", { exact: true })).toBeVisible();
  84  |   await mutate("/moderation/reports", {
  85  |     placeId: "synthetic_" + key,
  86  |     category: "WRONG_LOCATION",
  87  |   });
  88  |   await page.reload();
  89  |   await expect(pending.getByText("1", { exact: true })).toBeVisible({
  90  |     timeout: 22000,
  91  |   });
  92  |   await expect(page.getByText("Recent arrivals")).toBeVisible();
  93  |   await expect(
  94  |     page.getByRole("img", { name: "Case arrivals over seven days" }),
  95  |   ).toBeVisible();
  96  |   await capture("queue-dashboard");
  97  |   await page.getByLabel("Account menu").click();
  98  |   await page.getByRole("button", { name: "Sign out" }).click();
  99  |   await login(moderatorEmail);
  100 |   await page
  101 |     .getByRole("link", { name: "Available Queues", exact: true })
  102 |     .click();
  103 |   const card = page
  104 |     .locator("section")
  105 |     .filter({ has: page.getByRole("heading", { name: queueName }) });
  106 |   await card.getByRole("button", { name: "Subscribe", exact: true }).click();
  107 |   await expect(card.getByRole("button", { name: "Unsubscribe" })).toBeVisible();
  108 |   await capture("available-queues");
  109 |   await page
  110 |     .getByRole("link", { name: "My Subscribed Queues", exact: true })
  111 |     .first()
  112 |     .click();
  113 |   await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  114 |   await capture("subscribed-queues");
  115 |   await page.getByRole("link", { name: "Moderate", exact: true }).click();
  116 |   await expect(
```