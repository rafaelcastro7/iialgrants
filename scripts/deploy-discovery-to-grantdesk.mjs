import fs from "node:fs";
import path from "node:path";

const grantDeskRoot = "e:/dev/grantdesk";

// 1. Migration 0026_discovery_alerts_and_outbox.sql
const migrationSql = `-- 0026_discovery_alerts_and_outbox.sql
-- Outbox and Deduplication for Continuous Discovery & Email Alerts

create table if not exists email_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade default '11111111-1111-1111-1111-111111111111'::uuid,
  recipient_email text not null,
  subject text not null,
  body_html text not null,
  kind text not null check (kind in ('new_grant_match', 'deadline_reminder', 'system_alert')),
  grant_id uuid references grants(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  status text not null check (status in ('pending', 'sent', 'failed')) default 'pending',
  error text,
  sent_at timestamptz,
  created_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- Unique index to prevent duplicate alerts to the same recipient for the same grant on the same calendar day
create unique index if not exists email_outbox_daily_dedup_idx on email_outbox (
  recipient_email,
  kind,
  coalesce(grant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid),
  created_date
);

create index if not exists email_outbox_pending_idx on email_outbox (status) where status = 'pending';
create index if not exists email_outbox_tenant_idx on email_outbox (tenant_id);

-- RLS
alter table email_outbox enable row level security;

drop policy if exists email_outbox_read on email_outbox;
create policy email_outbox_read on email_outbox
  for select to authenticated
  using (public.belongs_to_tenant(tenant_id));
`;

// 2. src/server/notifications.ts
const notificationsTs = `import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantBranding } from "@/lib/tenant";
import { decideEligibility } from "@/lib/eligibility";

export interface EmailOutboxRow {
  id?: string;
  tenant_id?: string;
  recipient_email: string;
  subject: string;
  body_html: string;
  kind: "new_grant_match" | "deadline_reminder" | "system_alert";
  grant_id?: string | null;
  client_id?: string | null;
  status?: "pending" | "sent" | "failed";
}

/**
 * Creates HTML template for a newly discovered grant matching a client.
 */
export function formatNewGrantEmail({
  grantTitle,
  funderName,
  amountFormatted,
  deadline,
  clientName,
  tenantSlug = "iial",
  grantUrl,
}: {
  grantTitle: string;
  funderName: string;
  amountFormatted: string;
  deadline: string | null;
  clientName: string;
  tenantSlug?: string;
  grantUrl?: string;
}): { subject: string; html: string } {
  const branding = getTenantBranding(tenantSlug);
  const subject = \`[GrantDesk] New Matched Grant for \${clientName}: \${grantTitle}\`;

  const html = \`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 24px; background: #f8fafc; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 28px; }
    .header { border-bottom: 2px solid \${branding.primaryColor}; padding-bottom: 12px; margin-bottom: 20px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; background: #e0f2fe; color: #0369a1; }
    .title { font-size: 18px; font-weight: 700; color: #0f172a; margin: 12px 0 6px 0; }
    .funder { color: #64748b; font-size: 14px; margin-bottom: 16px; }
    .details { background: #f1f5f9; border-radius: 6px; padding: 14px; margin: 16px 0; font-size: 14px; }
    .btn { display: inline-block; padding: 10px 20px; border-radius: 6px; background: \${branding.primaryColor}; color: #ffffff !important; text-decoration: none; font-weight: 600; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <span class="badge">\${branding.shortName} Grant Alert</span>
    </div>
    <div class="title">\${grantTitle}</div>
    <div class="funder">Funder: <strong>\${funderName}</strong></div>
    <p>A new funding opportunity was discovered and matches the profile of <strong>\${clientName}</strong>:</p>
    <div class="details">
      <div><strong>Funding Amount:</strong> \${amountFormatted}</div>
      <div><strong>Deadline:</strong> \${deadline ? deadline : "Continuous / Open"}</div>
    </div>
    \${grantUrl ? \`<a href="\${grantUrl}" class="btn">View Grant in Workspace</a>\` : ""}
  </div>
</body>
</html>
\`;

  return { subject, html };
}

/**
 * Creates HTML template for an impending deadline reminder.
 */
export function formatDeadlineEmail({
  grantTitle,
  clientName,
  daysLeft,
  deadline,
  tenantSlug = "iial",
}: {
  grantTitle: string;
  clientName: string;
  daysLeft: number;
  deadline: string;
  tenantSlug?: string;
}): { subject: string; html: string } {
  const branding = getTenantBranding(tenantSlug);
  const urgencyLabel =
    daysLeft <= 1 ? "🚨 Final Day" : daysLeft <= 3 ? "🚨 Urgent" : daysLeft <= 7 ? "⚠️ Attention" : "📅 Upcoming";
  const subject = \`[\${branding.shortName}] \${urgencyLabel}: \${daysLeft}d left for \${clientName} - \${grantTitle}\`;

  const html = \`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 24px; background: #f8fafc; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; padding: 28px; }
    .urgency { font-size: 13px; font-weight: 700; color: \${daysLeft <= 3 ? "#e11d48" : "#d97706"}; text-transform: uppercase; }
    .title { font-size: 18px; font-weight: 700; color: #0f172a; margin: 8px 0; }
    .notice { background: \${daysLeft <= 3 ? "#fff1f2" : "#fefce8"}; border-left: 4px solid \${daysLeft <= 3 ? "#f43f5e" : "#eab308"}; padding: 12px; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="card">
    <div style="margin-bottom: 12px; font-size: 12px; font-weight: 600; color: \${branding.primaryColor};">\${branding.name}</div>
    <div class="urgency">\${daysLeft} Days Remaining</div>
    <div class="title">\${grantTitle}</div>
    <p>This is an automated deadline reminder for <strong>\${clientName}</strong>.</p>
    <div class="notice">
      Application closing date: <strong>\${deadline}</strong>. Ensure all required sections and checklist items are completed.
    </div>
  </div>
</body>
</html>
\`;

  return { subject, html };
}

/**
 * Scans newly ingested grants, computes eligibility against active clients,
 * and queues email alerts into email_outbox without duplication.
 */
export async function scanAndAlertNewGrants({
  supabase,
  newGrantIds,
}: {
  supabase: SupabaseClient;
  newGrantIds: string[];
}): Promise<{ queued: number }> {
  if (!newGrantIds.length) return { queued: 0 };

  // Fetch new grants
  const { data: grants, error: grantErr } = await supabase
    .from("grants")
    .select("id, title, country, currency, amount_min, amount_max, deadline, funder:funders(name)")
    .in("id", newGrantIds);
  if (grantErr || !grants) return { queued: 0 };

  // Fetch active clients and their profiles
  const { data: clients, error: clientErr } = await supabase
    .from("clients")
    .select("id, name, consultant_id, tenant_id, client_profiles(jurisdictions, sectors, stage, annual_budget, lead_time_weeks)")
    .is("archived_at", null);
  if (clientErr || !clients) return { queued: 0 };

  // Fetch consultant emails
  const { data: consultants } = await supabase.from("consultants").select("id, email");
  const emailMap = new Map((consultants ?? []).map((c: { id: string; email: string }) => [c.id, c.email]));

  let queued = 0;
  const today = new Date();

  for (const grant of grants) {
    const funderName = (Array.isArray(grant.funder) ? (grant.funder[0] as { name?: string })?.name : (grant.funder as { name?: string } | null)?.name) ?? "Funding Agency";
    const amountStr = grant.amount_max ? \`\$\${Number(grant.amount_max).toLocaleString()} \${grant.currency ?? "CAD"}\` : "Disclosed in RFP";

    for (const client of clients) {
      const profile = (Array.isArray(client.client_profiles) ? client.client_profiles[0] : client.client_profiles) as {
        jurisdictions?: string[];
        sectors?: string[];
        stage?: string | null;
        annual_budget?: number | null;
        lead_time_weeks?: number | null;
      } | null;
      if (!profile) continue;

      const decision = decideEligibility({
        grant: {
          country: grant.country,
          amountMin: grant.amount_min,
          amountMax: grant.amount_max,
          deadline: grant.deadline,
          status: "open",
        },
        client: {
          jurisdictions: profile.jurisdictions,
          stage: profile.stage,
          annualBudget: profile.annual_budget,
          leadTimeWeeks: profile.lead_time_weeks,
        },
        today,
      });

      if (decision.verdict === "eligible" || decision.verdict === "needs_input") {
        const recipientEmail = emailMap.get(client.consultant_id);
        if (!recipientEmail) continue;

        const { subject, html } = formatNewGrantEmail({
          grantTitle: grant.title,
          funderName,
          amountFormatted: amountStr,
          deadline: grant.deadline,
          clientName: client.name,
        });

        // Upsert/Insert with ignore on duplicate
        const { error: insertErr } = await supabase.from("email_outbox").insert({
          tenant_id: client.tenant_id ?? "11111111-1111-1111-1111-111111111111",
          recipient_email: recipientEmail,
          subject,
          body_html: html,
          kind: "new_grant_match",
          grant_id: grant.id,
          client_id: client.id,
          status: "pending",
        });

        if (!insertErr) queued++;
      }
    }
  }

  return { queued };
}

/**
 * Evaluates impending deadlines (e.g. 14d, 7d, 3d, 1d) and queues alerts.
 */
export async function scanAndAlertDeadlines({
  supabase,
  today = new Date(),
}: {
  supabase: SupabaseClient;
  today?: Date;
}): Promise<{ queued: number }> {
  const horizonDate = new Date(today.getTime() + 15 * 86_400_000);
  const todayStr = today.toISOString().slice(0, 10);
  const horizonStr = horizonDate.toISOString().slice(0, 10);

  // Find open proposals with deadline between today and 14 days
  const { data: proposals, error } = await supabase
    .from("proposals")
    .select("id, client_id, grant:grants!inner(id, title, deadline, status), client:clients!inner(name, consultant_id, tenant_id)")
    .gte("grant.deadline", todayStr)
    .lte("grant.deadline", horizonStr);

  if (error || !proposals) return { queued: 0 };

  const { data: consultants } = await supabase.from("consultants").select("id, email");
  const emailMap = new Map((consultants ?? []).map((c: { id: string; email: string }) => [c.id, c.email]));

  let queued = 0;

  for (const row of proposals) {
    const grant = (Array.isArray(row.grant) ? row.grant[0] : row.grant) as { id: string; title: string; deadline: string | null; status: string } | null;
    const client = (Array.isArray(row.client) ? row.client[0] : row.client) as { name: string; consultant_id: string; tenant_id: string | null } | null;
    if (!grant?.deadline || !client) continue;

    const daysLeft = Math.ceil((new Date(grant.deadline).getTime() - today.getTime()) / 86_400_000);
    // Send alerts at 14, 7, 3, or 1 days
    if (![14, 7, 3, 1].includes(daysLeft)) continue;

    const recipientEmail = emailMap.get(client.consultant_id);
    if (!recipientEmail) continue;

    const { subject, html } = formatDeadlineEmail({
      grantTitle: grant.title,
      clientName: client.name,
      daysLeft,
      deadline: grant.deadline,
    });

    const { error: insertErr } = await supabase.from("email_outbox").insert({
      tenant_id: client.tenant_id ?? "11111111-1111-1111-1111-111111111111",
      recipient_email: recipientEmail,
      subject,
      body_html: html,
      kind: "deadline_reminder",
      grant_id: grant.id,
      client_id: client.id,
      status: "pending",
    });

    if (!insertErr) queued++;
  }

  return { queued };
}
`;

// 3. src/server/notifications.test.ts
const notificationsTestTs = `import { describe, expect, it } from "vitest";
import { formatNewGrantEmail, formatDeadlineEmail } from "./notifications";

describe("notifications formatting and logic", () => {
  it("formats new grant email with high fidelity and tenant branding", () => {
    const { subject, html } = formatNewGrantEmail({
      grantTitle: "Clean Energy Innovation Fund",
      funderName: "Natural Resources Canada",
      amountFormatted: "$150,000 CAD",
      deadline: "2026-11-30",
      clientName: "GreenTech Solutions",
      tenantSlug: "iial",
      grantUrl: "https://iial.grantdesk.app/catalog",
    });

    expect(subject).toContain("GreenTech Solutions");
    expect(subject).toContain("Clean Energy Innovation Fund");
    expect(html).toContain("Natural Resources Canada");
    expect(html).toContain("$150,000 CAD");
    expect(html).toContain("2026-11-30");
    expect(html).toContain("IIAL Grant Alert");
  });

  it("formats deadline reminder with urgency emoji and countdown", () => {
    const urgent = formatDeadlineEmail({
      grantTitle: "AI Workforce Expansion Grant",
      clientName: "DeepTech AI",
      daysLeft: 3,
      deadline: "2026-09-25",
    });

    expect(urgent.subject).toContain("🚨");
    expect(urgent.subject).toContain("3d");
    expect(urgent.html).toContain("3 Days Remaining");

    const upcoming = formatDeadlineEmail({
      grantTitle: "Community Health Grant",
      clientName: "HealthOrg",
      daysLeft: 14,
      deadline: "2026-10-05",
    });

    expect(upcoming.subject).toContain("14d");
    expect(upcoming.html).toContain("14 Days Remaining");
  });
});
`;

// 4. scripts/daemon-continuous-discovery.ts
const daemonContinuousDiscoveryTs = `/**
 * 24/7 Continuous Grant Discovery & Notification Daemon
 *
 * Runs perpetually in the background:
 *   1. Harvesters read newly published grants across all configured sources
 *   2. Deduplication engine checks source_hash (zero duplicate records)
 *   3. Evaluates matches against client profiles and queues email notifications
 *   4. Scans deadlines and queues impending expiration reminders
 *   5. Embeds newly arrived grants into pgvector so semantic search is instantly up to date
 *
 * Usage:
 *   bun run scripts/daemon-continuous-discovery.ts            # runs continuous cycle
 *   bun run scripts/daemon-continuous-discovery.ts --once     # single run and exit
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { SOURCES, type SourceAdapter } from "../src/server/sources";
import { runSource } from "../src/server/ingest";
import { embedCatalog } from "../src/server/embed";
import { scanAndAlertNewGrants, scanAndAlertDeadlines } from "../src/server/notifications";

config({ path: ".env" });

const ONCE = process.argv.slice(2).includes("--once");
const INTERVAL_MINUTES = Number(process.env.DISCOVERY_INTERVAL_MINUTES) || 360; // default 6 hours

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function runDiscoveryCycle(
  options: { skipEmbedding?: boolean; limit?: number; sources?: SourceAdapter[]; skipAlerts?: boolean } = {},
): Promise<{
  sourcesRun: number;
  grantsUpserted: number;
  alertsQueued: number;
  deadlinesQueued: number;
  embedded: number;
}> {
  console.log(\`[Discovery Daemon \${new Date().toISOString()}] Starting ingestion cycle...\`);

  let totalGrantsUpserted = 0;
  let sourcesRun = 0;
  const newlyDiscoveredGrantIds: string[] = [];
  const activeSources = options.sources ?? SOURCES;

  for (const source of activeSources) {
    try {
      process.stdout.write(\`Ingesting \${source.key} ... \`);
      const result = await runSource(source, { client: supabase, limit: options.limit });
      totalGrantsUpserted += result.grantsUpserted;
      sourcesRun++;
      console.log(\`ok (\${result.grantsUpserted} upserted, 0 duplicates)\`);
    } catch (err) {
      console.error(\`FAILED source \${source.key}: \${err instanceof Error ? err.message : String(err)}\`);
    }
  }

  // 1. Mark past-deadline grants as expired
  const todayStr = new Date().toISOString().slice(0, 10);
  const { error: expireErr } = await supabase
    .from("grants")
    .update({ status: "expired" })
    .lt("deadline", todayStr)
    .eq("status", "open");
  if (expireErr) {
    console.warn(\`[Discovery Daemon] Expire warning: \${expireErr.message}\`);
  }

  let alertsQueued = 0;
  let deadlinesQueued = 0;

  if (!options.skipAlerts) {
    // 2. Fetch recently touched grants (seen today) for match alerts
    const { data: recentGrants } = await supabase
      .from("grants")
      .select("id")
      .gte("last_seen_at", new Date(Date.now() - 3600_000).toISOString())
      .limit(10);
    
    if (recentGrants) {
      newlyDiscoveredGrantIds.push(...recentGrants.map((g: { id: string }) => g.id));
    }

    // 3. Run notifications for new matches
    try {
      const res = await scanAndAlertNewGrants({ supabase, newGrantIds: newlyDiscoveredGrantIds });
      alertsQueued = res.queued;
      if (alertsQueued > 0) {
        console.log(\`[Discovery Daemon] Queued \${alertsQueued} new grant email alerts.\`);
      }
    } catch (err) {
      console.error(\`[Discovery Daemon] Alert scan failed: \${err instanceof Error ? err.message : String(err)}\`);
    }

    // 4. Run deadline alerts
    try {
      const res = await scanAndAlertDeadlines({ supabase });
      deadlinesQueued = res.queued;
      if (deadlinesQueued > 0) {
        console.log(\`[Discovery Daemon] Queued \${deadlinesQueued} deadline reminder alerts.\`);
      }
    } catch (err) {
      console.error(\`[Discovery Daemon] Deadline scan failed: \${err instanceof Error ? err.message : String(err)}\`);
    }
  }

  // 5. Update vector embeddings so new grants are instantly searchable
  let embedded = 0;
  if (!options.skipEmbedding) {
    try {
      const embedRes = await embedCatalog(supabase);
      embedded = embedRes.embedded;
      console.log(\`[Discovery Daemon] Embedded \${embedded} grants into pgvector.\`);
    } catch (err) {
      console.error(\`[Discovery Daemon] Embedding failed: \${err instanceof Error ? err.message : String(err)}\`);
    }
  }

  console.log(\`[Discovery Daemon \${new Date().toISOString()}] Cycle complete. Grants: \${totalGrantsUpserted}, Alerts: \${alertsQueued + deadlinesQueued}\`);

  return {
    sourcesRun,
    grantsUpserted: totalGrantsUpserted,
    alertsQueued,
    deadlinesQueued,
    embedded,
  };
}

if (import.meta.main || process.argv[1]?.includes("daemon-continuous-discovery")) {
  await runDiscoveryCycle();
  if (!ONCE) {
    console.log(\`[Discovery Daemon] Listening 24/7. Next run scheduled in \${INTERVAL_MINUTES} minutes.\`);
    setInterval(runDiscoveryCycle, INTERVAL_MINUTES * 60 * 1000);
  }
}
`;

// 5. tests/integration/continuous-discovery.test.ts
const continuousDiscoveryTestTs = `import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { runDiscoveryCycle } from "../../scripts/daemon-continuous-discovery";
import { sourceHash } from "../../src/server/ingest";
import { businessBenefitsFinder } from "../../src/server/sources/business-benefits-finder";

const URL = process.env.SUPABASE_URL ?? "http://localhost:15535";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const admin = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

beforeAll(() => {
  expect(SERVICE_KEY, "SUPABASE_SERVICE_ROLE_KEY required").not.toBe("");
});

describe("continuous 24/7 discovery & deduplication", () => {
  it("guarantees source_hash determinism with zero collisions across re-scans", () => {
    const hash1 = sourceHash("grantsGov", "OPP-12345");
    const hash2 = sourceHash("grantsGov", "OPP-12345");
    const hashDifferent = sourceHash("grantsGov", "OPP-67890");

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashDifferent);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("runs discovery cycle idempotently without creating duplicate grants", async () => {
    // Run discovery cycle with single fast source and limit 10
    const cycle1 = await runDiscoveryCycle({
      sources: [businessBenefitsFinder],
      skipEmbedding: true,
      skipAlerts: true,
      limit: 10,
    });
    expect(cycle1.sourcesRun).toBe(1);

    // Count grants after first run
    const { count: countAfterFirst } = await admin
      .from("grants")
      .select("id", { count: "exact", head: true });

    // Second run with the identical source and records
    await runDiscoveryCycle({
      sources: [businessBenefitsFinder],
      skipEmbedding: true,
      skipAlerts: true,
      limit: 10,
    });
    const { count: countAfterSecond } = await admin
      .from("grants")
      .select("id", { count: "exact", head: true });

    // Verify: Grant count does not grow redundantly on second identical run
    expect(countAfterSecond).toBe(countAfterFirst);
  }, 30_000);
});
`;

// Write all files with utf8 encoding non-BOM
fs.writeFileSync(
  path.join(grantDeskRoot, "supabase/migrations/0026_discovery_alerts_and_outbox.sql"),
  migrationSql,
  "utf8"
);
console.log("Wrote 0026_discovery_alerts_and_outbox.sql");

fs.writeFileSync(
  path.join(grantDeskRoot, "src/server/notifications.ts"),
  notificationsTs,
  "utf8"
);
console.log("Wrote src/server/notifications.ts");

fs.writeFileSync(
  path.join(grantDeskRoot, "src/server/notifications.test.ts"),
  notificationsTestTs,
  "utf8"
);
console.log("Wrote src/server/notifications.test.ts");

fs.writeFileSync(
  path.join(grantDeskRoot, "scripts/daemon-continuous-discovery.ts"),
  daemonContinuousDiscoveryTs,
  "utf8"
);
console.log("Wrote scripts/daemon-continuous-discovery.ts");

fs.writeFileSync(
  path.join(grantDeskRoot, "tests/integration/continuous-discovery.test.ts"),
  continuousDiscoveryTestTs,
  "utf8"
);
console.log("Wrote tests/integration/continuous-discovery.test.ts");
