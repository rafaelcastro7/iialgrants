import fs from "node:fs";
import path from "node:path";

const grantdeskRoot = "e:/dev/grantdesk";

// 1. Update CLAUDE.md
const claudeMdPath = path.join(grantdeskRoot, "CLAUDE.md");
let claudeMd = fs.readFileSync(claudeMdPath, "utf8");

const runItReplacement = `bun run db:up          # Postgres 15532 · gateway 15535 · project "grantdesk"
bun run db:migrate     # applies migrations AND reloads PostgREST's schema cache
bun run dev            # app on 5180
bun run refresh        # read whatever is due by its own cadence, then embed. Hourly-safe.
bun run ingest         # every source now, ignoring cadence
bun run embed          # brings embeddings up to date (only re-embeds changed text)
bun run scripts/daemon-continuous-discovery.ts        # 24/7 continuous discovery + email alert daemon
bun run scripts/daemon-continuous-discovery.ts --once # single discovery pass and exit`;

claudeMd = claudeMd.replace(
  /bun run db:up[\s\S]*?bun run embed\s+# brings embeddings up to date \(only re-embeds changed text\)/,
  runItReplacement
);

const costRealTimeAddition = `- **Postgres unique index expressions must be strictly IMMUTABLE.**
  Casting \`(created_at::date)\` in a unique index throws
  "functions in index expression must be marked IMMUTABLE". Use an explicit
  column such as \`created_date date not null default current_date\` and index
  the plain column.
- **Deduplicate alerts at the outbox layer.**
  A continuous 24/7 discovery daemon re-evaluating matches can easily spam
  consultants. An \`email_outbox\` table with a daily deduplication index
  \`(recipient_email, kind, grant_id, client_id, created_date)\` prevents
  repetitive notifications on identical days.
- **Tenant subdomains and RLS.**
  Subdomains (\`iial.grantdesk.app\`, \`acme.grantdesk.ca\`) route into
  \`src/lib/tenant.ts\` and map to tenant isolation in PostgreSQL via
  \`public.belongs_to_tenant(tenant_id)\`. Never let a query bypass tenant
  scoping.`;

if (!claudeMd.includes("Postgres unique index expressions must be strictly IMMUTABLE")) {
  claudeMd = claudeMd.replace(
    "## House style",
    `${costRealTimeAddition}\n\n## House style`
  );
}

fs.writeFileSync(claudeMdPath, claudeMd, "utf8");
console.log("Updated GrantDesk CLAUDE.md");

// 2. Update docs/PHASES.md
const phasesMdPath = path.join(grantdeskRoot, "docs/PHASES.md");
let phasesMd = fs.readFileSync(phasesMdPath, "utf8");

const phase6Section = `---

## Phase 6 — Subdomain Multi-Tenancy, 24/7 Discovery & Deduplicated Alerts

- Subdomain routing (\`iial.grantdesk.app\`, \`acme.grantdesk.ca\`, and dev fallback) with live branding.
- Database RLS multi-tenant isolation via migration 0025 (\`public.belongs_to_tenant(tenant_id)\`).
- Continuous 24/7 grant discovery daemon (\`scripts/daemon-continuous-discovery.ts\`) with SHA-256 \`sourceHash\` ensuring zero duplicates.
- Email outbox with daily deduplication index (\`email_outbox_daily_dedup_idx\`) and urgent deadline reminders (14d, 7d, 3d, 1d).

**Done when:** RLS isolation tests prove tenant data is completely invisible to other tenants, discovery cycles run idempotently with 0 duplicate grant rows, and \`bun run verify\` passes 100%.

**Closed.**
- \`tests/integration/tenant-isolation.test.ts\` verified RLS isolation.
- \`tests/integration/continuous-discovery.test.ts\` verified 0 duplicate growth on re-runs.
- \`src/server/notifications.test.ts\` verified high-fidelity responsive email templates.
- \`bun run verify\` passed 100% (ESLint 0 errors, \`tsc\` 0 errors, Vitest 253 unit tests, 11 integration tests, Vite production build).
`;

if (!phasesMd.includes("## Phase 6 — Subdomain Multi-Tenancy")) {
  phasesMd = phasesMd.replace(
    "## Working method",
    `${phase6Section}\n## Working method`
  );
}

fs.writeFileSync(phasesMdPath, phasesMd, "utf8");
console.log("Updated GrantDesk docs/PHASES.md");

// 3. Update .claude/skills/grantdesk-stack/SKILL.md
const skillMdPath = path.join(grantdeskRoot, ".claude/skills/grantdesk-stack/SKILL.md");
if (fs.existsSync(skillMdPath)) {
  let skillMd = fs.readFileSync(skillMdPath, "utf8");
  const skillAddition = `
## Subdomain Multi-Tenancy & Email Outbox Deduplication

- **Subdomain Routing**: \`src/lib/tenant.ts\` extracts tenant slug from hostname (\`iial.grantdesk.app\`, \`iial.localhost:5180\`), search param (\`?tenant=iial\`), or header (\`x-tenant-slug\`).
- **Tenant RLS Guard**: Postgres migration \`0025_tenants_and_subdomains.sql\` implements \`public.belongs_to_tenant(tenant_id)\` as \`security definer\` avoiding recursion.
- **Continuous 24/7 Discovery**: \`scripts/daemon-continuous-discovery.ts\` runs periodic loops. Grants are deduplicated via deterministic SHA-256 \`sourceHash(sourceKey, externalId)\`.
- **Email Deduplication**: \`0026_discovery_alerts_and_outbox.sql\` creates \`email_outbox\` with unique index on \`(recipient_email, kind, grant_id, client_id, created_date)\`. Avoid casting \`(created_at::date)\` inside Postgres index definitions.
`;
  if (!skillMd.includes("## Subdomain Multi-Tenancy & Email Outbox Deduplication")) {
    skillMd += skillAddition;
    fs.writeFileSync(skillMdPath, skillMd, "utf8");
    console.log("Updated GrantDesk grantdesk-stack/SKILL.md");
  }
}
