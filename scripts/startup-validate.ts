/**
 * Startup validation for the IIAL Grants stack.
 *
 * Answers one question: "is the whole system actually working right now?" —
 * not just "did a process start". Every check exercises the real path the app
 * uses, so a green run means a user can log in and search.
 *
 * Exit code 0 = all required checks passed. Non-zero = something is broken,
 * and the summary says exactly what.
 *
 * Usage: bun run scripts/startup-validate.ts [--json]
 */

import { createClient } from "@supabase/supabase-js";
import { appendFileSync } from "fs";
import { join } from "path";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:15435";
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const APP_URL = process.env.APP_URL || "http://localhost:8080";
const DEMO_EMAIL = "demo-admin@iial.test";
const DEMO_PASSWORD = "IIAL-Demo-2026!";
const LOG = join(import.meta.dir, "startup-validate.log");
const JSON_OUT = process.argv.includes("--json");

type Result = {
  name: string;
  ok: boolean;
  detail: string;
  required: boolean;
  ms: number;
};

const results: Result[] = [];

async function check(name: string, required: boolean, fn: () => Promise<string>) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail, required, ms: Date.now() - started });
  } catch (error) {
    results.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      required,
      ms: Date.now() - started,
    });
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// --- 1. Database gateway -----------------------------------------------------
await check("supabase gateway", true, async () => {
  const response = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/health`, {
    headers: { apikey: ANON_KEY },
  });
  if (!response.ok) throw new Error(`auth health HTTP ${response.status}`);
  const body = (await response.json()) as { name?: string; version?: string };
  return `${body.name ?? "gotrue"} ${body.version ?? ""} at ${SUPABASE_URL}`;
});

// --- 2. Authentication -------------------------------------------------------
let supabase: ReturnType<typeof createClient> | null = null;
await check("demo login", true, async () => {
  if (!ANON_KEY) throw new Error("SUPABASE_PUBLISHABLE_KEY is not set");
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (error) throw new Error(error.message);
  supabase = client;
  return `signed in as ${DEMO_EMAIL}`;
});

// --- 3. Catalog contents (read through RLS, as the app does) -----------------
let funderCount = 0;
let grantCount = 0;
await check("catalog populated", true, async () => {
  if (!supabase) throw new Error("skipped: no authenticated client");
  const [funders, grants, embedded] = await Promise.all([
    supabase.from("funders").select("id", { count: "exact", head: true }),
    supabase.from("grants").select("id", { count: "exact", head: true }),
    supabase.from("grant_search_documents").select("grant_id", { count: "exact", head: true }),
  ]);
  if (funders.error) throw new Error(`funders: ${funders.error.message}`);
  if (grants.error) throw new Error(`grants: ${grants.error.message}`);
  funderCount = funders.count ?? 0;
  grantCount = grants.count ?? 0;
  if (funderCount === 0) throw new Error("funders table is empty");
  if (grantCount === 0) throw new Error("grants table is empty");
  return `${funderCount} funders, ${grantCount} grants, ${embedded.count ?? 0} embedded`;
});

// --- 4. Funders are actually reachable through search ------------------------
await check("funders linked to grants", true, async () => {
  if (!supabase) throw new Error("skipped: no authenticated client");
  const { data, error } = await supabase.from("grants").select("funder_id").limit(2000);
  if (error) throw new Error(error.message);
  const linked = new Set((data ?? []).map((row) => row.funder_id)).size;
  if (linked < 2)
    throw new Error(`only ${linked} funder(s) have grants — search cannot reach them`);
  return `${linked} funders have at least one grant`;
});

// --- 5. Local embedding model ------------------------------------------------
await check("ollama embeddings", true, async () => {
  const tags = await fetchWithTimeout(`${OLLAMA_URL}/api/tags`);
  if (!tags.ok) throw new Error(`ollama HTTP ${tags.status}`);
  const { models } = (await tags.json()) as { models?: Array<{ name: string }> };
  const names = (models ?? []).map((m) => m.name);
  if (!names.some((n) => n.startsWith("nomic-embed-text"))) {
    throw new Error(`nomic-embed-text not installed (have: ${names.join(", ") || "none"})`);
  }
  const embed = await fetchWithTimeout(
    `${OLLAMA_URL}/api/embeddings`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "nomic-embed-text", prompt: "grant funding validation" }),
    },
    60000,
  );
  if (!embed.ok) throw new Error(`embeddings HTTP ${embed.status}`);
  const { embedding } = (await embed.json()) as { embedding?: number[] };
  if (embedding?.length !== 768) throw new Error(`expected 768 dims, got ${embedding?.length}`);
  return `nomic-embed-text ready (768 dims)`;
});

// --- 5b. Local agent chat models --------------------------------------------
// Separate pulls from the embedding model, and their absence is quiet: the
// agent falls through to a cloud provider, so runs mostly still succeed and
// only fail when that fallback is unavailable. The critic failed exactly this
// way with ollama_prewarm_404: model 'phi4-mini:latest' not found, leaving
// proposals.critic_score NULL and the submit gate reporting "not reviewed"
// even though the UI had shown the review running to completion.
await check("ollama agent models", true, async () => {
  const tags = await fetchWithTimeout(`${OLLAMA_URL}/api/tags`);
  if (!tags.ok) throw new Error(`ollama HTTP ${tags.status}`);
  const { models } = (await tags.json()) as { models?: Array<{ name: string }> };
  const names = (models ?? []).map((m) => m.name);
  const required = ["phi4-mini", "dolphin3"];
  const missing = required.filter((r) => !names.some((n) => n.startsWith(r)));
  if (missing.length) {
    throw new Error(
      `missing local agent model(s): ${missing.join(", ")} — run "ollama pull <model>". ` +
        `Agents silently fall back to a cloud provider without them.`,
    );
  }
  return `${required.join(", ")} installed`;
});

// --- 5c. Cloud LLM chain (advisory: local Ollama still covers every agent) ---
// Cerebras -> Groq -> Gemini, tried in that order before falling back local.
// Provider model IDs rot: Gemini's mapped gemini-2.0-* pair had been retired
// outright, so the whole tertiary rung was dead without anything reporting it.
await check("cloud llm chain", false, async () => {
  const { CEREBRAS_MODEL_MAP, GROQ_MODEL_MAP, GEMINI_MODEL_MAP } =
    await import("../src/agents/llm-cloud.server");
  const providers = [
    {
      name: "cerebras",
      url: "https://api.cerebras.ai/v1",
      key: process.env.CEREBRAS_API_KEY,
      model: CEREBRAS_MODEL_MAP.evaluator,
    },
    {
      name: "groq",
      url: "https://api.groq.com/openai/v1",
      key: process.env.GROQ_API_KEY,
      model: GROQ_MODEL_MAP.evaluator,
    },
    {
      name: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai",
      key: process.env.GOOGLE_AI_STUDIO_KEY,
      model: GEMINI_MODEL_MAP.evaluator,
    },
  ];

  const results: string[] = [];
  const broken: string[] = [];
  for (const p of providers) {
    if (!p.key) {
      results.push(`${p.name}:no-key`);
      continue;
    }
    try {
      const response = await fetchWithTimeout(
        `${p.url}/chat/completions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
          body: JSON.stringify({
            model: p.model,
            messages: [{ role: "user", content: "Reply with the single word: ready" }],
            max_tokens: 8,
            temperature: 0,
          }),
        },
        30000,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      results.push(`${p.name}:ok`);
    } catch (error) {
      broken.push(`${p.name} (${p.model}): ${error instanceof Error ? error.message : error}`);
      results.push(`${p.name}:FAIL`);
    }
  }
  if (broken.length) {
    throw new Error(
      `${broken.join("; ")} — run "bun run scripts/check-cloud-llm.ts" for the model list`,
    );
  }
  return results.join(", ");
});

// --- 6. The real hybrid search path the /grants page uses --------------------
await check("hybrid search end-to-end", true, async () => {
  if (!supabase) throw new Error("skipped: no authenticated client");
  const { searchGrantCatalogHybrid } = await import("../src/lib/grant-search-hybrid.server");
  const probes = ["NIH", "innovation", "research"];
  const lines: string[] = [];
  for (const probe of probes) {
    const { matches, degradedReason } = await searchGrantCatalogHybrid(
      supabase as never,
      probe,
      20,
    );
    if (matches.length === 0) throw new Error(`query "${probe}" returned no results`);
    if (degradedReason) {
      throw new Error(`query "${probe}" degraded to lexical-only: ${degradedReason}`);
    }
    lines.push(`${probe}=${matches.length}`);
  }
  return `hybrid mode confirmed (${lines.join(", ")})`;
});

// --- 7. Web app --------------------------------------------------------------
await check("web app", true, async () => {
  const response = await fetchWithTimeout(APP_URL, {}, 30000);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${APP_URL}`);
  return `HTTP 200 at ${APP_URL}`;
});

// --- 8. Continuous ingestion (advisory: catalog still works without it) ------
await check("ingestion daemon", false, async () => {
  const { existsSync, statSync, readFileSync } = await import("fs");
  const log = join(import.meta.dir, "ingestion-report.log");
  if (!existsSync(log)) throw new Error("no ingestion-report.log yet");
  const ageHours = (Date.now() - statSync(log).mtimeMs) / 3_600_000;
  const last = readFileSync(log, "utf8").trim().split("\n").at(-1) ?? "";
  if (ageHours > 12) throw new Error(`last cycle ${ageHours.toFixed(1)}h ago`);
  return `last activity ${ageHours.toFixed(1)}h ago — ${last.slice(0, 90)}`;
});

// --- report ------------------------------------------------------------------
const failedRequired = results.filter((r) => !r.ok && r.required);
const failedOptional = results.filter((r) => !r.ok && !r.required);
const stamp = new Date().toISOString();

if (JSON_OUT) {
  console.log(JSON.stringify({ stamp, ok: failedRequired.length === 0, results }, null, 2));
} else {
  console.log(`\nIIAL Grants — startup validation  ${stamp}`);
  console.log("=".repeat(64));
  for (const r of results) {
    const mark = r.ok ? "PASS" : r.required ? "FAIL" : "WARN";
    console.log(`  [${mark}] ${r.name.padEnd(28)} ${r.detail} (${r.ms}ms)`);
  }
  console.log("=".repeat(64));
  console.log(
    failedRequired.length === 0
      ? `ALL SYSTEMS GO — ${funderCount} funders, ${grantCount} grants searchable`
      : `${failedRequired.length} REQUIRED CHECK(S) FAILED`,
  );
  if (failedOptional.length) {
    console.log(`(${failedOptional.length} advisory warning(s))`);
  }
}

appendFileSync(
  LOG,
  `[${stamp}] ${failedRequired.length === 0 ? "OK" : "FAIL"} — ` +
    results.map((r) => `${r.name}:${r.ok ? "pass" : "fail"}`).join(" ") +
    "\n",
);

process.exit(failedRequired.length === 0 ? 0 : 1);
