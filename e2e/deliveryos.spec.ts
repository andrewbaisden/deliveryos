import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

async function signIn(page: Page, email: string, home = "/ops") {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${home}$`));
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(({ impact }) =>
    ["serious", "critical"].includes(impact ?? ""),
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

test("protected operations routes redirect to sign in", async ({ page }) => {
  await page.goto("/ops");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});

test("dispatcher creates and opens a delivery", async ({ page }) => {
  await signIn(page, "admin@deliveryos.local");
  await expect(
    page.getByRole("heading", { name: "Good to see you, Jordan." }),
  ).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);

  await page.goto("/ops/deliveries/new");
  await page.getByLabel("Customer name").fill("Playwright Customer");
  await page.getByLabel("Customer email").fill("pw@example.test");
  await page.getByLabel("Pickup address").fill("Stratford City");
  await page.getByLabel("Pickup postcode").fill("E20 1EJ");
  await page.getByLabel("Drop-off address").fill("Covent Garden");
  await page.getByLabel("Drop-off postcode").fill("WC2E 8RF");
  await page.getByRole("button", { name: "Create delivery" }).click();
  await expect(page).toHaveURL(/\/ops\/deliveries\/[0-9a-f-]+$/);
  await expect(
    page.getByText("Playwright Customer", { exact: true }),
  ).toBeVisible();
});

test("driver completes the seeded delivery with proof", async ({ page }) => {
  await signIn(page, "driver@deliveryos.local", "/driver");
  await expect(
    page.getByText("Delivery #DOS-18421", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Arrived at customer" }).click();
  await expect(page.getByLabel("Recipient name")).toBeVisible();
  await page.getByLabel("Recipient name").fill("Taylor Reed");
  await page.getByLabel("Delivery note").fill("Handed to recipient");
  await page.getByRole("button", { name: "Complete delivery" }).click();
  await expect(page.getByText("Delivered", { exact: true })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test("customer sees the restricted delivered projection", async ({ page }) => {
  await page.goto("/track/deliveryos-demo-track-18421");
  await expect(page.getByRole("heading", { name: "Delivered" })).toBeVisible();
  await expect(page.getByText("Taylor Reed")).toHaveCount(0);
  await expect(page.getByText("Handed to recipient")).toHaveCount(0);
  await expectNoSeriousAccessibilityViolations(page);
});
