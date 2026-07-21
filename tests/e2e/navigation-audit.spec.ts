import { expect, test, type Page } from "@playwright/test";

const DEMO_MEMBER = "Member A";
const DEMO_ADMIN = "Admin";

function captureBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

async function signInDemo(page: Page, buttonName: string) {
  await page.goto("/auth");
  await page.getByRole("button", { name: buttonName }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: /run the grant operation from one place/i }),
  ).toBeVisible();
}

async function clickAndAssert(
  page: Page,
  href: string,
  urlPattern: RegExp,
  ready: () => Promise<void>,
) {
  await test.step(href, async () => {
    const link = page.locator(`a[href="${href}"]`).filter({ visible: true }).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(urlPattern);
    await ready();
  });
}

test.describe("navigation audit - member", () => {
  test("dashboard links, grants workflow, and audit trail all navigate", async ({ page }) => {
    const errors = captureBrowserErrors(page);

    await signInDemo(page, DEMO_MEMBER);

    await clickAndAssert(page, "/grants", /\/grants\/?$/, async () => {
      await expect(
        page.getByRole("heading", { name: /prioritize every opportunity/i }),
      ).toBeVisible();
      await expect(page.getByRole("searchbox", { name: /search grants/i })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Queue" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Lifecycle" })).toBeVisible();
    });

    const firstGrantLink = page.locator('a[href^="/grants/"]').first();
    await expect(firstGrantLink).toBeVisible();
    await firstGrantLink.click();
    await expect(page).toHaveURL(/\/grants\/[^/]+$/);
    await expect(page.getByRole("link", { name: /audit/i })).toBeVisible();

    const auditTrailLink = page.getByRole("link", { name: /audit/i });
    await auditTrailLink.click();
    await expect(page).toHaveURL(/\/grants\/[^/]+\/audit$/);
    await expect(page.getByText(/rules evaluated/i)).toBeVisible();
    await expect(page.getByText(/evidence used/i)).toBeVisible();
    await expect(page.getByText(/agent trace/i)).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/grants\/[^/]+$/);

    await page.goto("/dashboard");
    await clickAndAssert(page, "/proposals", /\/proposals\/?$/, async () => {
      await expect(page.getByRole("heading", { name: /proposals/i }).first()).toBeVisible();
    });

    await page.goto("/dashboard");
    await clickAndAssert(page, "/submissions", /\/submissions\/?$/, async () => {
      await expect(page.getByRole("heading", { name: /submissions/i }).first()).toBeVisible();
    });

    await page.goto("/dashboard");
    await clickAndAssert(page, "/org", /\/org\/?$/, async () => {
      await expect(page.getByText(/^Organization name$/i)).toBeVisible();
    });

    await page.goto("/dashboard");
    await clickAndAssert(page, "/fit-rules", /\/fit-rules\/?$/, async () => {
      await expect(page.getByRole("heading", { name: /screening rules/i }).first()).toBeVisible();
    });

    await page.goto("/dashboard");
    await clickAndAssert(page, "/privacy", /\/privacy\/?$/, async () => {
      await expect(page.getByRole("heading", { name: /privacy/i }).first()).toBeVisible();
    });

    await page.goto("/dashboard");
    await clickAndAssert(page, "/compliance", /\/compliance\/?$/, async () => {
      await expect(page.getByRole("heading", { name: /compliance/i }).first()).toBeVisible();
    });

    expect(errors).toEqual([]);
  });
});

test.describe("navigation audit - admin", () => {
  test("console sidebar links navigate", async ({ page }) => {
    const errors = captureBrowserErrors(page);

    await signInDemo(page, DEMO_ADMIN);
    await clickAndAssert(page, "/admin", /\/admin\/?$/, async () => {
      await expect(page.getByRole("heading", { name: /overview/i })).toBeVisible();
    });

    await clickAndAssert(page, "/admin/users", /\/admin\/users\/?$/, async () => {
      await expect(page.getByRole("heading", { name: /users/i })).toBeVisible();
    });

    await clickAndAssert(page, "/admin/modules", /\/admin\/modules\/?$/, async () => {
      await expect(page.getByRole("heading", { name: /modules/i })).toBeVisible();
    });

    await clickAndAssert(page, "/admin/agents", /\/admin\/agents\/?$/, async () => {
      await expect(page.getByRole("heading", { name: /agent console/i })).toBeVisible();
    });

    await clickAndAssert(page, "/admin/sources", /\/admin\/sources\/?$/, async () => {
      await expect(page.getByRole("heading", { name: /discovery sources/i })).toBeVisible();
    });

    await clickAndAssert(page, "/admin/candidates", /\/admin\/candidates\/?$/, async () => {
      await expect(page.getByRole("heading", { name: /funder candidates/i })).toBeVisible();
    });

    await clickAndAssert(page, "/admin/history", /\/admin\/history\/?$/, async () => {
      await expect(page.getByRole("heading", { name: /discovery history/i })).toBeVisible();
    });

    await page.locator('a[href="/dashboard"]').filter({ visible: true }).last().click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: /run the grant operation from one place/i }),
    ).toBeVisible();

    expect(errors).toEqual([]);
  });
});
