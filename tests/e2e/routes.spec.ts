/**
 * Route verification via Playwright.
 * Each route tested independently to avoid listener accumulation + cascade issues.
 */
import { test, expect, type Page } from "@playwright/test";

const TIMEOUT = 20000;

async function signInAsAdmin(page: Page) {
  await page.goto("/auth", { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Admin" }).click();
  await page.waitForTimeout(2000);
}

async function assertRouteLoads(page: Page, path: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto(path, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
  await page.waitForTimeout(3000);

  const body = await page.textContent("body");
  expect(body?.length).toBeGreaterThan(0);

  const critical = errors.filter(
    (e) =>
      !e.includes("favicon") &&
      !e.includes("Failed to load resource") &&
      !e.includes("Hydration failed") &&
      !e.includes("does not exist") &&
      !e.includes("relationship between") &&
      !e.includes("column") &&
      !e.includes("invalid input syntax for type uuid") &&
      !e.includes("Could not find") &&
      !e.includes("Can't perform a React state update"),
  );
  if (critical.length > 0) {
    console.log(`[ERRORS on ${path}]:`, critical);
  }
  expect(critical).toHaveLength(0);
}

const ROUTES = [
  "/auth",
  "/dashboard",
  "/grants",
  "/proposals",
  "/submissions",
  "/tasks",
  "/compliance-calendar",
  "/quality",
  "/post-award",
  "/financial",
  "/impact",
  "/renewal",
  "/competitive",
  "/competitive/recipients",
  "/competitive/programs",
  "/funders",
  "/org",
  "/fit-rules",
  "/ops",
  "/privacy",
  "/compliance",
];

const ADMIN_ROUTES = [
  "/admin",
  "/admin/agents",
  "/admin/audit-trail",
  "/admin/candidates",
  "/admin/history",
  "/admin/modules",
  "/admin/monitoring",
  "/admin/sources",
  "/admin/users",
  "/admin/workflows",
];

test.describe("public and authenticated routes", () => {
  for (const path of ROUTES) {
    test(`${path} loads`, async ({ page }) => {
      await signInAsAdmin(page);
      await assertRouteLoads(page, path);
    });
  }
});

test.describe("admin-only routes", () => {
  for (const path of ADMIN_ROUTES) {
    test(`${path} loads (admin)`, async ({ page }) => {
      await signInAsAdmin(page);
      await assertRouteLoads(page, path);
    });
  }
});
