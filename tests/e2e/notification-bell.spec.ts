// Verifies the notification bell (docs/PRODUCT-DIFFERENTIATION.md #12,
// "closing the last gap against Instrumentl's multi-touch reminders")
// actually surfaces a real deadline reminder to the user who owns it —
// not just that the daily cron can insert a row into `notifications`.
//
// This used to depend on seed state created by hand on 2026-07-31 (an IRAP
// grant with deadline = current_date + 5, plus one manual signed call to the
// deadlines webhook). That state expires by construction: a fixed date stops
// being "in 5 days" the next day, and the `notifications` table was empty and
// the grant archived with a deadline 55 days out when this was re-run on
// 2026-08-16. The spec now builds its own precondition and drives the real
// pipeline — set a deadline, fire the genuinely HMAC-signed webhook, then
// assert what the user sees — so it tests the feature instead of a snapshot.
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEADLINE_DAYS = 5;

// Same .env then .env.local precedence Vite itself applies, so this fixture
// targets whichever backend the app under test is talking to.
function loadEnvFile(path: string, override: boolean) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    if (!override && process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

test("Notification bell surfaces a real deadline reminder with unread count", async ({
  page,
  request,
}) => {
  loadEnvFile(join(process.cwd(), ".env"), false);
  loadEnvFile(join(process.cwd(), ".env.local"), true);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  test.skip(!url || !key, "Supabase service env is required to seed the deadline fixture");
  const admin = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The webhook only reminds about grants that are actually in someone's
  // pipeline (shortlisted / in_proposal / submitted) and closing within 14
  // days, so borrow a grant that already has a proposal on it.
  const { data: proposals, error: proposalError } = await admin
    .from("proposals")
    .select("user_id, grant:grants!inner(id, title, status)")
    .in("grant.status", ["shortlisted", "in_proposal", "submitted"])
    .limit(1);
  if (proposalError) throw new Error(proposalError.message);
  test.skip(
    !proposals?.length,
    "no proposal on a shortlisted/in_proposal/submitted grant to attach a reminder to",
  );
  const row = proposals![0];
  const grant = (Array.isArray(row.grant) ? row.grant[0] : row.grant) as {
    id: string;
    title: string;
  };

  const deadline = new Date(Date.now() + DEADLINE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { error: updateError } = await admin
    .from("grants")
    .update({ deadline } as never)
    .eq("id", grant.id);
  if (updateError) throw new Error(updateError.message);

  // The hook skips a grant that already got a reminder in the last 24h, so
  // clear any prior one rather than silently asserting against a stale row.
  await admin.from("notifications").delete().eq("grant_id", grant.id).eq("kind", "deadline");

  const { data: secretRow } = await admin
    .from("webhook_config")
    .select("value")
    .eq("key", "hmac_secret")
    .maybeSingle();
  const secret = (secretRow as { value?: string } | null)?.value;
  test.skip(!secret, "webhook_config.hmac_secret is not configured");

  // Sign exactly as verifyWebhookRequest expects: hex HMAC-SHA256 over
  // `${ts}.${nonce}.${rawBody}`, with a single-use nonce.
  const body = "{}";
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(24).toString("base64url");
  const signature = createHmac("sha256", secret!).update(`${ts}.${nonce}.${body}`).digest("hex");

  const hookResponse = await request.post("/api/public/hooks/deadlines", {
    headers: {
      "content-type": "application/json",
      "x-iial-timestamp": ts,
      "x-iial-nonce": nonce,
      "x-iial-signature": signature,
    },
    data: body,
  });
  expect(
    hookResponse.ok(),
    `deadlines webhook rejected the signed request: ${hookResponse.status()} ${await hookResponse.text()}`,
  ).toBe(true);
  const hookBody = (await hookResponse.json()) as { ok: boolean; created: number };
  expect(
    hookBody.created,
    "the webhook created no reminder for the seeded deadline",
  ).toBeGreaterThan(0);

  // Now the part that matters: does the owner actually see it?
  await page.goto("/auth");
  await page.getByRole("button", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const bellButton = page.getByRole("button", { name: /notification/i });
  await expect(bellButton).toBeVisible();
  await expect(bellButton.getByText(/^[1-9]\d*$/), "no unread badge on the bell").toBeVisible();

  await bellButton.click();
  const deadlineNotification = page.getByRole("link", {
    name: new RegExp(`^Deadline in ${DEADLINE_DAYS} day\\(s\\)`),
  });
  await expect(deadlineNotification).toBeVisible();
  await expect(deadlineNotification).toContainText(grant.title.slice(0, 30));
});
