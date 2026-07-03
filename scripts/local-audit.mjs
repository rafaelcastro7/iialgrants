// Local code auditor — runs entirely on Ollama (localhost:11434), zero cloud tokens.
// Usage: node scripts/local-audit.mjs [model]
// Writes findings to scripts/local-audit-report.json
import { readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { resolve } from "node:path";

// Plain node:http POST — avoids undici's 5-minute headers timeout, which a
// slow local generation can exceed.
function postJson(url, payload, timeoutMs = 900_000) {
  return new Promise((resolveP, rejectP) => {
    const body = JSON.stringify(payload);
    const u = new URL(url);
    const req = request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolveP({ status: res.statusCode, text: data }));
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("local_llm_timeout"));
    });
    req.on("error", rejectP);
    req.write(body);
    req.end();
  });
}

const MODEL = process.argv[2] ?? "qwen2.5-coder:7b";
const OLLAMA = "http://localhost:11434/v1/chat/completions";
const ROOT = resolve(import.meta.dirname, "..");

// Optional single-file mode: node scripts/local-audit.mjs <model> <file>
const SINGLE = process.argv[3];
// Files not yet audited this cycle + phase-8 touched files.
const DEFAULT_TARGETS = [
  "src/agents/translate.server.ts",
  "src/lib/notebooklm.functions.ts",
  "src/lib/source-curator/orchestrator.server.ts",
  "src/lib/source-curator/tri-council.server.ts",
  "src/lib/rss-ingestor.server.ts",
  "src/lib/deep-crawl.server.ts",
  "src/lib/site-candidates.server.ts",
  "src/agents/embeddings.server.ts",
  "src/lib/search-hybrid.server.ts",
  "src/lib/embeddings-cache.server.ts",
];
const TARGETS = SINGLE ? [SINGLE] : DEFAULT_TARGETS;

const SYSTEM = `You are a strict senior code auditor. Analyze the TypeScript file for REAL, reproducible bugs only:
- race conditions, lost updates, unsafe concurrency
- null/undefined dereferences, unchecked array indexing
- off-by-one and boundary errors (dates, ranges, slicing)
- regex bugs (missing /g when counting, lastIndex leaks, accents vs \\b)
- silent failures (swallowed errors that lose data), wrong fallbacks
- logic inverted or dead conditions
Ignore style, naming, performance micro-optimizations and hypotheticals.
Respond ONLY with JSON: {"findings":[{"line":<approx>,"severity":"CRITICAL"|"HIGH"|"MEDIUM","issue":"...","repro":"..."}]}
If nothing qualifies, respond {"findings":[]}.`;

async function auditFile(rel) {
  let code;
  try {
    code = readFileSync(resolve(ROOT, rel), "utf8");
  } catch {
    return { file: rel, error: "unreadable" };
  }
  // Cap to keep local context manageable (qwen2.5-coder 32k ctx).
  const body = {
    model: MODEL,
    temperature: 0,
    stream: false,
    // Cap generation: 7B models in JSON mode can loop forever without it.
    max_tokens: 1200,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `File: ${rel}\n\n\`\`\`ts\n${code.slice(0, 16000)}\n\`\`\`` },
    ],
  };
  const t0 = Date.now();
  let res;
  try {
    res = await postJson(OLLAMA, body);
  } catch (e) {
    return { file: rel, error: `fetch_failed: ${e.message}` };
  }
  if (res.status !== 200) return { file: rel, error: `ollama_${res.status}` };
  const data = JSON.parse(res.text);
  const text = data?.choices?.[0]?.message?.content ?? "{}";
  let findings = [];
  try {
    findings = JSON.parse(text).findings ?? [];
  } catch {
    return { file: rel, error: "bad_json", raw: text.slice(0, 300) };
  }
  return { file: rel, ms: Date.now() - t0, findings };
}

const report = { model: MODEL, startedAt: new Date().toISOString(), results: [] };
const OUT = resolve(ROOT, "scripts", "local-audit-report.json");
for (const f of TARGETS) {
  process.stdout.write(`auditing ${f} ... `);
  const r = await auditFile(f);
  report.results.push(r);
  writeFileSync(OUT, JSON.stringify(report, null, 2)); // incremental save
  console.log(r.error ? `ERROR ${r.error}` : `${r.findings.length} finding(s) in ${r.ms}ms`);
}
report.finishedAt = new Date().toISOString();
writeFileSync(resolve(ROOT, "scripts", "local-audit-report.json"), JSON.stringify(report, null, 2));
const total = report.results.reduce((a, r) => a + (r.findings?.length ?? 0), 0);
console.log(`\nDone. ${total} raw finding(s) → scripts/local-audit-report.json`);
