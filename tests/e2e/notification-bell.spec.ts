// Verifies the notification bell (docs/PRODUCT-DIFFERENTIATION.md #12,
// "closing the last gap against Instrumentl's multi-touch reminders")
// actually surfaces a real deadline reminder to the user who owns it —
// not just that the daily cron can insert a row into `notifications`.
//
// Depends on seed state set up once (not by this test, matching this
// suite's existing pattern of assuming specific seeded grants like "NRC
// IRAP" rather than each spec re-seeding its own data): the demo admin's
// seeded IRAP proposal's grant needs a deadline within the 14-day
// reminder horizon, and the real /api/public/hooks/deadlines webhook must
// have run at least once since. Verified live 2026-07-31 by setting
// grants.deadline to current_date+5 for the seeded IRAP grant and firing
// a properly HMAC-signed POST to that hook directly -- it created a real
// "Deadline in 5 day(s)" row, which is what this test now checks for.
import { expect, test } from "@playwright/test";

test("Notification bell surfaces a real deadline reminder with unread count", async ({ page }) => {
  await page.goto("/auth");
  await page.getByRole("button", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const bellButton = page.getByRole("button", { name: /notification/i });
  await expect(bellButton).toBeVisible();
  await expect(bellButton.getByText(/^[1-9]\d*$/)).toBeVisible();

  await bellButton.click();
  const deadlineNotification = page.getByRole("link", { name: /^Deadline in 5 day\(s\)/ });
  await expect(deadlineNotification).toBeVisible();
  await expect(deadlineNotification).toContainText(/industrial research assistance program/i);
});
