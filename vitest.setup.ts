import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load env vars for live/batch-pipeline tests, mirroring the same .env ->
// .env.local precedence `vite dev`/`npm run dev` already applies — without
// this, live tests always hit the CLOUD Supabase project from .env
// (regardless of what dev is actually pointed at), because .env.local was
// never read here at all. Confirmed live: `live-pipeline.test.ts` failed
// with "Invalid API key" while the dev server, running against the same
// checkout, was healthy against local Supabase — the test suite and the
// dev server were silently talking to two different databases.
function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      out[key] = val;
    }
  } catch {
    /* file not found — caller falls back to whatever else is loaded */
  }
  return out;
}

const base = parseEnvFile(resolve(import.meta.dirname ?? ".", ".env"));
const local = parseEnvFile(resolve(import.meta.dirname ?? ".", ".env.local"));
const merged = { ...base, ...local };
for (const [key, val] of Object.entries(merged)) {
  // A real shell/CI env var always wins over either file.
  if (!process.env[key]) process.env[key] = val;
}
