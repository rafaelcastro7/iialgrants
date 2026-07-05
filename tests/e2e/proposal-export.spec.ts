import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEMO_ADMIN = "Admin";
const DEMO_ADMIN_EMAIL = "demo-admin@iial.test";
const FUNDER_ID = "20000000-0000-0000-0000-000000000001";
const GRANT_ID = "20000000-0000-0000-0000-000000000002";
const PROPOSAL_ID = "20000000-0000-0000-0000-000000000003";

function loadLocalEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

function captureBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

async function seedProposalExportFixture() {
  loadLocalEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  test.skip(!url || !key, "Supabase service env is required for local export E2E seed");

  const admin = createClient(url!, key!, { auth: { persistSession: false } });
  const { data: users, error: userError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (userError) throw userError;
  const demoAdmin = users.users.find((u) => u.email?.toLowerCase() === DEMO_ADMIN_EMAIL);
  test.skip(!demoAdmin, "Demo admin user is required; run scripts/demo-seed.mjs first");

  await admin.from("proposal_sections").delete().eq("proposal_id", PROPOSAL_ID);
  await admin.from("proposals").delete().eq("id", PROPOSAL_ID);
  await admin.from("grants").delete().eq("id", GRANT_ID);
  await admin.from("funders").delete().eq("id", FUNDER_ID);

  const { error: funderError } = await admin.from("funders").insert({
    id: FUNDER_ID,
    name: "Export Test Funder",
  });
  if (funderError) throw funderError;

  const { error: grantError } = await admin.from("grants").insert({
    id: GRANT_ID,
    funder_id: FUNDER_ID,
    title: "Export Test Grant",
    summary: "A local fixture grant for export testing.",
    currency: "CAD",
    eligibility: {},
    requirements: ["Include project impact", "Include budget"],
    sectors: ["education"],
    country: "CA",
    language: "en",
    url: "https://example.test/export-grant",
    source_hash: "export-e2e-fixture",
    status: "in_proposal",
  });
  if (grantError) throw grantError;

  const { error: proposalError } = await admin.from("proposals").insert({
    id: PROPOSAL_ID,
    user_id: demoAdmin!.id,
    grant_id: GRANT_ID,
    title: "Export Test Proposal",
    version: 3,
    critic_score: 0.82,
  });
  if (proposalError) throw proposalError;

  const { error: sectionError } = await admin.from("proposal_sections").insert([
    {
      proposal_id: PROPOSAL_ID,
      user_id: demoAdmin!.id,
      kind: "summary",
      ord: 1,
      heading_en: "Executive Summary",
      heading_fr: "Resume",
      content_en: "This proposal improves applied learning outcomes with a measurable pilot.",
      content_fr: "Cette proposition ameliore les resultats d'apprentissage applique.",
      citations: [],
    },
    {
      proposal_id: PROPOSAL_ID,
      user_id: demoAdmin!.id,
      kind: "budget",
      ord: 2,
      heading_en: "Budget",
      heading_fr: "Budget",
      content_en: "The requested grant supports staffing, evaluation, and delivery costs.",
      citations: [],
    },
  ]);
  if (sectionError) throw sectionError;
}

async function cleanupProposalExportFixture() {
  loadLocalEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const admin = createClient(url, key, { auth: { persistSession: false } });
  await admin.from("proposal_sections").delete().eq("proposal_id", PROPOSAL_ID);
  await admin.from("proposals").delete().eq("id", PROPOSAL_ID);
  await admin.from("grants").delete().eq("id", GRANT_ID);
  await admin.from("funders").delete().eq("id", FUNDER_ID);
}

test.describe("proposal export downloads", () => {
  test.beforeEach(seedProposalExportFixture);
  test.afterEach(cleanupProposalExportFixture);

  test("advanced proposal page downloads Markdown, DOCX, and PDF", async ({ page }, testInfo) => {
    const errors = captureBrowserErrors(page);

    await page.goto("/auth");
    await page.getByRole("button", { name: DEMO_ADMIN }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto(`/proposals/${PROPOSAL_ID}`);
    await page.getByRole("tab", { name: "Advanced" }).click();
    await expect(page.getByRole("heading", { name: "Export Test Proposal" })).toBeVisible();
    await expect(page.getByText(/Version 3/)).toBeVisible();

    const cases = [
      { name: "Export Markdown", extension: ".md", signature: "# Export Test Proposal" },
      { name: "Export DOCX", extension: ".docx", signature: "PK" },
      { name: "Export PDF", extension: ".pdf", signature: "%PDF-" },
    ];

    for (const c of cases) {
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: c.name }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(
        `proposal-${PROPOSAL_ID.slice(0, 8)}${c.extension}`,
      );
      const target = join(testInfo.outputDir, download.suggestedFilename());
      await download.saveAs(target);
      const bytes = readFileSync(target);
      expect(bytes.subarray(0, c.signature.length).toString("utf8")).toBe(c.signature);
    }

    expect(errors).toEqual([]);
  });
});
