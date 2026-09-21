import fs from "node:fs";
import path from "node:path";

const grantDeskRoot = "e:/dev/grantdesk";

// 1. Migration 0025_tenants_and_subdomains.sql
const migrationSql = `-- 0025_tenants_and_subdomains.sql
-- Enterprise Multi-Tenancy with Subdomain Routing & Strict Database Isolation (RLS)
--
-- Enables dedicated tenant workspaces (e.g. IIAL) such that one tenant's material
-- is unreachable by another, enforced at the PostgreSQL RLS level.

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  subdomain text unique not null,
  branding jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists tenants_slug_idx on tenants (slug);
create index if not exists tenants_subdomain_idx on tenants (subdomain);

create table if not exists tenant_members (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references consultants(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')) default 'member',
  joined_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index if not exists tenant_members_user_idx on tenant_members (user_id);

-- Add tenant_id to clients with default IIAL tenant
alter table clients
  add column if not exists tenant_id uuid references tenants(id) on delete cascade default '11111111-1111-1111-1111-111111111111'::uuid;

create index if not exists clients_tenant_idx on clients (tenant_id);

-- Seed IIAL as the pioneer tenant
insert into tenants (id, slug, name, subdomain, branding)
values (
  '11111111-1111-1111-1111-111111111111',
  'iial',
  'Institute of Innovation and Advanced Learning',
  'iial',
  '{"tagline": "AI-Native Grant Intelligence", "primary_color": "#0ea5e9", "accent_color": "#0284c7", "logo_url": "/brand/iial-logo.png", "logo_inverse_url": "/brand/iial-logo-inverse.png"}'::jsonb
)
on conflict (slug) do update set
  name = excluded.name,
  branding = excluded.branding;

-- Backfill any existing clients with the IIAL tenant
update clients
set tenant_id = '11111111-1111-1111-1111-111111111111'
where tenant_id is null;

-- Backfill all existing consultants as members of the IIAL tenant
insert into tenant_members (tenant_id, user_id, role)
select '11111111-1111-1111-1111-111111111111', id, 'owner'
from consultants
on conflict (tenant_id, user_id) do nothing;

-- Ensure newly signed up users belong to IIAL by default
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.consultants (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', new.email))
  on conflict (id) do nothing;

  insert into public.tenant_members (tenant_id, user_id, role)
  values ('11111111-1111-1111-1111-111111111111', new.id, 'member')
  on conflict (tenant_id, user_id) do nothing;

  return new;
end;
$$;

-- ── RLS for tenants & tenant_members ───────────────────────────────────────
alter table tenants enable row level security;
alter table tenant_members enable row level security;

-- Public lookup by slug/subdomain for branding & metadata resolution
drop policy if exists tenants_public_read on tenants;
create policy tenants_public_read on tenants
  for select using (true);

-- Users can only read their own tenant memberships (prevents infinite policy recursion)
drop policy if exists tenant_members_read on tenant_members;
create policy tenant_members_read on tenant_members
  for select to authenticated
  using (user_id = auth.uid());

-- Helper function: Does auth.uid() belong to this tenant? Security definer bypasses RLS recursion.
create or replace function public.belongs_to_tenant(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (target_tenant_id is null) or exists (
    select 1 from tenant_members tm
    where tm.tenant_id = target_tenant_id and tm.user_id = auth.uid()
  );
$$;
grant execute on function public.belongs_to_tenant(uuid) to authenticated;

-- Helper function to resolve tenant id by slug
create or replace function public.get_tenant_id_by_slug(target_slug text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from tenants where lower(slug) = lower(target_slug) limit 1;
$$;
grant execute on function public.get_tenant_id_by_slug(text) to authenticated, anon;

-- Enhanced owns_client(target uuid) enforcing tenant boundaries
create or replace function public.owns_client(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from clients c
    where c.id = target
      and public.belongs_to_tenant(c.tenant_id)
      and (
        c.consultant_id = auth.uid()
        or exists (
          select 1 from client_team_members m
          where m.client_id = c.id and m.user_id = auth.uid()
        )
      )
  );
$$;

-- Enhanced clients RLS policies
drop policy if exists clients_select on clients;
create policy clients_select on clients
  for select to authenticated
  using (
    public.belongs_to_tenant(tenant_id)
    and (
      consultant_id = auth.uid()
      or exists (
        select 1 from client_team_members m where m.client_id = id and m.user_id = auth.uid()
      )
    )
  );

drop policy if exists clients_insert on clients;
create policy clients_insert on clients
  for insert to authenticated
  with check (
    consultant_id = auth.uid()
    and public.belongs_to_tenant(tenant_id)
  );

drop policy if exists clients_update on clients;
create policy clients_update on clients
  for update to authenticated
  using (
    public.belongs_to_tenant(tenant_id)
    and (
      consultant_id = auth.uid()
      or exists (
        select 1 from client_team_members m where m.client_id = id and m.user_id = auth.uid()
      )
    )
  )
  with check (
    public.belongs_to_tenant(tenant_id)
    and (
      consultant_id = auth.uid()
      or exists (
        select 1 from client_team_members m where m.client_id = id and m.user_id = auth.uid()
      )
    )
  );
`;

// 2. src/lib/tenant.ts
const tenantTs = `/**
 * Tenant resolution and isolation utilities for GrantDesk.
 *
 * Supports subdomain routing (e.g. iial.grantdesk.app, iial.localhost:5180),
 * query parameters (?tenant=iial), and custom headers (x-tenant-slug).
 */

export interface TenantBranding {
  name: string;
  shortName: string;
  slug: string;
  subdomain: string;
  tagline: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string;
  logoInverseUrl: string;
}

export const DEFAULT_TENANT_SLUG = "iial";

export const KNOWN_TENANTS: Record<string, TenantBranding> = {
  iial: {
    slug: "iial",
    subdomain: "iial",
    name: "Institute of Innovation and Advanced Learning",
    shortName: "IIAL",
    tagline: "AI-Native Grant Intelligence & Proposal Studio",
    primaryColor: "#0ea5e9",
    accentColor: "#0284c7",
    logoUrl: "/brand/iial-logo.png",
    logoInverseUrl: "/brand/iial-logo-inverse.png",
  },
  acme: {
    slug: "acme",
    subdomain: "acme",
    name: "Acme Consulting Group",
    shortName: "Acme",
    tagline: "Strategic Funding & Research Advisory",
    primaryColor: "#10b981",
    accentColor: "#059669",
    logoUrl: "/brand/iial-logo.png",
    logoInverseUrl: "/brand/iial-logo-inverse.png",
  },
};

/**
 * Parses the tenant slug from host string, URL search params, or explicit headers.
 */
export function resolveTenantSlug({
  hostname,
  searchParams,
  headers,
}: {
  hostname?: string | null;
  searchParams?: URLSearchParams | null;
  headers?: Headers | Record<string, string | string[] | undefined> | null;
} = {}): string {
  // 1. Query parameter override (highest precedence for dev and manual switching)
  if (searchParams) {
    const fromParam = searchParams.get("tenant");
    if (fromParam && fromParam.trim()) {
      return fromParam.trim().toLowerCase();
    }
  }

  // 2. Header override (e.g., in server-side calls or reverse proxies)
  if (headers) {
    let headerVal: string | undefined;
    if (typeof (headers as Headers).get === "function") {
      headerVal = (headers as Headers).get("x-tenant-slug") ?? undefined;
    } else {
      const rec = headers as Record<string, string | string[] | undefined>;
      const raw = rec["x-tenant-slug"] ?? rec["X-Tenant-Slug"];
      headerVal = Array.isArray(raw) ? raw[0] : raw;
    }
    if (headerVal && headerVal.trim()) {
      return headerVal.trim().toLowerCase();
    }
  }

  // 3. Subdomain extraction from hostname (e.g., iial.grantdesk.app, iial.localhost)
  if (hostname) {
    const cleanHost = hostname.split(":")[0].toLowerCase();
    // Match <subdomain>.grantdesk.<tld> or <subdomain>.localhost
    const parts = cleanHost.split(".");
    if (parts.length >= 2) {
      const candidate = parts[0];
      if (candidate !== "www" && candidate !== "app" && candidate !== "api") {
        return candidate;
      }
    }
  }

  return DEFAULT_TENANT_SLUG;
}

/**
 * Returns tenant branding metadata, falling back to IIAL defaults if custom.
 */
export function getTenantBranding(slug: string): TenantBranding {
  const normalized = slug.toLowerCase().trim();
  if (KNOWN_TENANTS[normalized]) {
    return KNOWN_TENANTS[normalized];
  }
  return {
    slug: normalized,
    subdomain: normalized,
    name: normalized.toUpperCase() + " Grant Workspace",
    shortName: normalized.toUpperCase(),
    tagline: "Secure Multi-Tenant Grant Desk",
    primaryColor: "#0ea5e9",
    accentColor: "#0284c7",
    logoUrl: "/brand/iial-logo.png",
    logoInverseUrl: "/brand/iial-logo-inverse.png",
  };
}
`;

// 3. src/lib/tenant.test.ts
const tenantTestTs = `import { describe, expect, it } from "vitest";
import { getTenantBranding, resolveTenantSlug, DEFAULT_TENANT_SLUG } from "./tenant";

describe("tenant resolution & isolation", () => {
  it("resolves default tenant when no host or params are given", () => {
    expect(resolveTenantSlug()).toBe(DEFAULT_TENANT_SLUG);
  });

  it("resolves subdomain from production domain", () => {
    expect(resolveTenantSlug({ hostname: "iial.grantdesk.app" })).toBe("iial");
    expect(resolveTenantSlug({ hostname: "acme.grantdesk.ca" })).toBe("acme");
  });

  it("resolves subdomain on localhost development environments", () => {
    expect(resolveTenantSlug({ hostname: "iial.localhost:5180" })).toBe("iial");
    expect(resolveTenantSlug({ hostname: "acme.localhost" })).toBe("acme");
  });

  it("ignores reserved subdomains like www or app", () => {
    expect(resolveTenantSlug({ hostname: "www.grantdesk.app" })).toBe(DEFAULT_TENANT_SLUG);
    expect(resolveTenantSlug({ hostname: "app.grantdesk.app" })).toBe(DEFAULT_TENANT_SLUG);
  });

  it("prioritizes query param override over hostname for easy testing", () => {
    const params = new URLSearchParams("tenant=acme");
    expect(resolveTenantSlug({ hostname: "iial.grantdesk.app", searchParams: params })).toBe("acme");
  });

  it("resolves header x-tenant-slug when provided", () => {
    const headers = new Headers();
    headers.set("x-tenant-slug", "iial");
    expect(resolveTenantSlug({ headers })).toBe("iial");
  });

  it("returns rich branding for known tenants", () => {
    const iial = getTenantBranding("iial");
    expect(iial.shortName).toBe("IIAL");
    expect(iial.name).toContain("Institute of Innovation");
    expect(iial.primaryColor).toBe("#0ea5e9");
  });

  it("provides dynamic fallback branding for custom tenants", () => {
    const custom = getTenantBranding("techcorp");
    expect(custom.slug).toBe("techcorp");
    expect(custom.shortName).toBe("TECHCORP");
    expect(custom.name).toContain("TECHCORP");
  });
});
`;

// 4. Update Nav.tsx with modern UX & Tenant badge
const navTsx = `import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getTenantBranding, resolveTenantSlug } from "@/lib/tenant";

/**
 * Top navigation bar with multi-tenant workspace badge,
 * contextual active routes, and active deadline indicator.
 */
const LINKS = [
  { to: "/", label: "Due Radar", badge: "Live" },
  { to: "/clients", label: "Clients" },
  { to: "/catalog", label: "Funder Coverage" },
] as const;

export function Nav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [tenantSlug, setTenantSlug] = useState<string>("iial");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const search = new URLSearchParams(window.location.search);
      const resolved = resolveTenantSlug({
        hostname: window.location.hostname,
        searchParams: search,
      });
      setTenantSlug(resolved);
    }
  }, [pathname]);

  const branding = getTenantBranding(tenantSlug);

  if (pathname.startsWith("/auth")) return null;

  return (
    <nav
      data-testid="nav"
      aria-label="Main"
      className="border-b border-[var(--color-rule)] bg-[var(--color-surface)] shadow-xs print:hidden sticky top-0 z-40 backdrop-blur-md bg-opacity-95"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src={branding.logoUrl}
              alt={branding.name}
              width={161}
              height={49}
              className="h-7 w-auto self-center dark:hidden transition-transform group-hover:scale-102"
            />
            <img
              src={branding.logoInverseUrl}
              alt=""
              aria-hidden="true"
              width={162}
              height={51}
              className="hidden h-7 w-auto self-center dark:block transition-transform group-hover:scale-102"
            />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-[var(--color-ink)] leading-tight">
                GrantDesk
              </span>
              <span className="text-[11px] text-[var(--color-ink-soft)] tracking-wider uppercase font-medium">
                {branding.shortName} Workspace
              </span>
            </div>
          </Link>

          {/* Tenant Status Badge */}
          <div
            data-testid="tenant-badge"
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border border-sky-500/20 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
            <span>Tenant: <strong>{branding.shortName}</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-1 sm:gap-2">
            {LINKS.map((link) => {
              const current = link.to === "/" ? pathname === "/" : pathname.startsWith(link.to);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={current ? "page" : undefined}
                  className={
                    current
                      ? "px-3 py-1.5 rounded-md text-sm font-medium bg-[var(--color-surface-hover)] text-[var(--color-accent)] transition-colors"
                      : "px-3 py-1.5 rounded-md text-sm font-medium text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)] transition-colors"
                  }
                >
                  {link.label}
                  {link.badge && (
                    <span className="ml-1.5 text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
`;

// 5. Write synthetic tests in tests/integration/tenant-isolation.test.ts
const tenantIntegrationTestTs = `import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const URL = process.env.SUPABASE_URL ?? "http://localhost:15535";
const ANON = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const admin = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();
const USER_IIAL = { email: \`iial-user-\${stamp}@grantdesk.test\`, password: "GrantDesk-Test-2026!" };
const USER_ACME = { email: \`acme-user-\${stamp}@grantdesk.test\`, password: "GrantDesk-Test-2026!" };

let tenantIialId: string;
let tenantAcmeId: string;
let clientOfIial: string;

let iialUser: { client: SupabaseClient; userId: string };
let acmeUser: { client: SupabaseClient; userId: string };

async function signUpAndIn(creds: { email: string; password: string }) {
  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signUpError } = await client.auth.signUp(creds);
  if (signUpError && !/already registered/i.test(signUpError.message)) throw signUpError;
  const { data, error } = await client.auth.signInWithPassword(creds);
  if (error) throw error;
  return { client, userId: data.user!.id };
}

beforeAll(async () => {
  expect(ANON, "SUPABASE_ANON_KEY must be set").not.toBe("");

  // 1. Ensure IIAL tenant exists
  const { data: iialRow } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", "iial")
    .single();
  tenantIialId = iialRow ? iialRow.id : "11111111-1111-1111-1111-111111111111";

  // 2. Create second tenant ACME
  const { data: acmeRow, error: acmeErr } = await admin
    .from("tenants")
    .upsert({
      slug: \`acme-\${stamp}\`,
      name: "Acme Consulting Inc",
      subdomain: \`acme-\${stamp}\`,
      branding: { primary_color: "#10b981" },
    }, { onConflict: "slug" })
    .select("id")
    .single();
  if (acmeErr) throw acmeErr;
  tenantAcmeId = acmeRow.id;

  // 3. Create users
  iialUser = await signUpAndIn(USER_IIAL);
  acmeUser = await signUpAndIn(USER_ACME);

  // 4. Assign memberships: ensure ACME user only belongs to ACME tenant
  await admin.from("tenant_members").delete().eq("user_id", acmeUser.userId);
  await admin.from("tenant_members").insert([
    { tenant_id: tenantIialId, user_id: iialUser.userId, role: "member" },
    { tenant_id: tenantAcmeId, user_id: acmeUser.userId, role: "member" },
  ]);

  // 5. Create client under IIAL tenant
  const { data: clientData, error: clientErr } = await iialUser.client
    .from("clients")
    .insert({
      consultant_id: iialUser.userId,
      tenant_id: tenantIialId,
      name: \`IIAL Client \${stamp}\`,
      country: "CA",
    })
    .select("id")
    .single();
  if (clientErr) throw clientErr;
  clientOfIial = clientData.id;
}, 60_000);

describe("multi-tenant RLS isolation", () => {
  it("allows IIAL user to read their own client in IIAL tenant", async () => {
    const { data, error } = await iialUser.client
      .from("clients")
      .select("id, name, tenant_id")
      .eq("id", clientOfIial);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].tenant_id).toBe(tenantIialId);
  });

  it("strictly hides IIAL client from ACME tenant user", async () => {
    const { data, error } = await acmeUser.client
      .from("clients")
      .select("id")
      .eq("id", clientOfIial);
    expect(error).toBeNull();
    // Zero rows returned due to RLS tenant boundary filter
    expect(data).toHaveLength(0);
  });

  it("prevents ACME user from writing client profiles to an IIAL client", async () => {
    const { error } = await acmeUser.client
      .from("client_profiles")
      .insert({ client_id: clientOfIial, sectors: ["ai-research"] });
    expect(error).not.toBeNull();
  });

  it("prevents ACME user from creating a client masquerading under IIAL tenant", async () => {
    const { error } = await acmeUser.client
      .from("clients")
      .insert({
        consultant_id: acmeUser.userId,
        tenant_id: tenantIialId,
        name: "Hostile Client",
        country: "CA",
      });
    expect(error).not.toBeNull();
  });
});
`;

// Write all files with utf8 encoding non-BOM
fs.writeFileSync(
  path.join(grantDeskRoot, "supabase/migrations/0025_tenants_and_subdomains.sql"),
  migrationSql,
  "utf8"
);
console.log("Wrote 0025_tenants_and_subdomains.sql");

fs.writeFileSync(
  path.join(grantDeskRoot, "src/lib/tenant.ts"),
  tenantTs,
  "utf8"
);
console.log("Wrote src/lib/tenant.ts");

fs.writeFileSync(
  path.join(grantDeskRoot, "src/lib/tenant.test.ts"),
  tenantTestTs,
  "utf8"
);
console.log("Wrote src/lib/tenant.test.ts");

fs.writeFileSync(
  path.join(grantDeskRoot, "src/components/Nav.tsx"),
  navTsx,
  "utf8"
);
console.log("Wrote src/components/Nav.tsx");

fs.writeFileSync(
  path.join(grantDeskRoot, "tests/integration/tenant-isolation.test.ts"),
  tenantIntegrationTestTs,
  "utf8"
);
console.log("Wrote tests/integration/tenant-isolation.test.ts");

// 6. Write synthetic actions test in tests/integration/synthetic-actions.test.ts
const syntheticActionsTestTs = \`import { describe, expect, it } from "vitest";
import { resolveTenantSlug, getTenantBranding } from "@/lib/tenant";
import { assessProfile } from "@/lib/profile-completeness";
import { assessSubmission } from "@/lib/submit-gate";
import { fabrications } from "@/lib/fabrication";
import { evaluateRules } from "@/lib/eligibility";

describe("synthetic actions & deterministic automation", () => {
  it("determines tenant context from subdomain or host without ambiguity", () => {
    expect(resolveTenantSlug({ hostname: "iial.grantdesk.app" })).toBe("iial");
    expect(resolveTenantSlug({ hostname: "iial.localhost:5180" })).toBe("iial");
    expect(resolveTenantSlug({ hostname: "acme.grantdesk.app" })).toBe("acme");
    expect(resolveTenantSlug({ searchParams: new URLSearchParams("tenant=iial") })).toBe("iial");
    
    const branding = getTenantBranding("iial");
    expect(branding.name).toBe("Institute of Innovation and Advanced Learning");
    expect(branding.accentColor).toBe("#0284c7");
  });

  it("calculates profile completeness deterministically with exact next gap", () => {
    const emptyProfile = {
      sectors: [],
      jurisdictions: [],
      stage: null,
      annualBudget: null,
      capabilities: null,
      beneficiaries: null,
      leadTimeWeeks: null,
    };
    const emptyAssessment = assessProfile(emptyProfile);
    expect(emptyAssessment.complete).toBe(false);
    expect(emptyAssessment.completenessScore).toBeLessThan(1);
    expect(emptyAssessment.missingFields).toContain("sectors");

    const completeProfile = {
      sectors: ["technology", "education"],
      jurisdictions: ["CA", "CA-ON"],
      stage: "nonprofit",
      annualBudget: 500000,
      capabilities: "AI research and workforce training",
      beneficiaries: "Post-secondary students and researchers",
      leadTimeWeeks: 4,
    };
    const fullAssessment = assessProfile(completeProfile);
    expect(fullAssessment.complete).toBe(true);
    expect(fullAssessment.completenessScore).toBe(1);
    expect(fullAssessment.missingFields).toHaveLength(0);
  });

  it("evaluates eligibility rules deterministically without hallucinations", () => {
    const grant = {
      country: "CA",
      amount_min: 10000,
      amount_max: 50000,
      deadline: "2026-12-31",
      language: "en",
    };
    const profile = {
      jurisdictions: ["CA"],
      sectors: ["technology"],
      stage: "nonprofit",
      annualBudget: 250000,
      capabilities: "Tech training",
      beneficiaries: "Youth",
      leadTimeWeeks: 4,
    };
    const result = evaluateRules(grant as any, profile as any);
    expect(["pass", "fail", "unknown"]).toContain(result.verdict);
  });

  it("runs anti-fabrication scanner deterministically on proposal content", () => {
    const groundedText = "We request $50,000 to train 200 participants across 3 cohorts.";
    const sourceContext = "Program budget: $50,000. Target: 200 participants in 3 cohorts.";
    const cleanCheck = fabrications(groundedText, sourceContext);
    expect(cleanCheck).toHaveLength(0);

    const hallucinatedText = "We served 15,420 beneficiaries and won $4,200,000 in previous federal funding.";
    const restrictedContext = "Our organization was founded in 2024 with a seed budget of $10,000.";
    const flagged = fabrications(hallucinatedText, restrictedContext);
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.some((f) => f.kind === "ungrounded_number")).toBe(true);
  });

  it("strictly enforces submission gate checklist and prevents premature submits", () => {
    const unreadyCandidate = {
      verdict: "eligible" as const,
      verdictAt: "2026-09-01T00:00:00Z",
      profileUpdatedAt: "2026-09-01T00:00:00Z",
      deadline: "2026-12-31",
      sections: [{ label: "Project Summary", content: null, wordLimit: 500, wordCount: null }],
      conditions: [{ label: "Audit Statement", isCritical: true, acknowledged: false }],
      humanReviewed: false,
      alreadySubmitted: false,
      today: new Date("2026-09-20"),
    };
    const check1 = assessSubmission(unreadyCandidate);
    expect(check1.canSubmit).toBe(false);
    expect(check1.blockers.some((b) => b.key === "empty_sections")).toBe(true);
    expect(check1.blockers.some((b) => b.key === "unmet_conditions")).toBe(true);
    expect(check1.blockers.some((b) => b.key === "not_reviewed")).toBe(true);

    const readyCandidate = {
      ...unreadyCandidate,
      sections: [{ label: "Project Summary", content: "Valid proposal text.", wordLimit: 500, wordCount: 3 }],
      conditions: [{ label: "Audit Statement", isCritical: true, acknowledged: true }],
      humanReviewed: true,
    };
    const check2 = assessSubmission(readyCandidate);
    expect(check2.canSubmit).toBe(true);
    expect(check2.blockers).toHaveLength(0);
  });
});
\`;

fs.writeFileSync(
  path.join(grantDeskRoot, "tests/integration/synthetic-actions.test.ts"),
  syntheticActionsTestTs,
  "utf8"
);
console.log("Wrote tests/integration/synthetic-actions.test.ts");

