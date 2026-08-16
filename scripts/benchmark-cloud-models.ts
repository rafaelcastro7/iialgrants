/**
 * Rank candidate cloud models by what the agents actually need: valid,
 * complete structured JSON — not just a 200 response.
 *
 * The chain was pinned to one mid-size model for every role on the strength of
 * a note that the larger ones "truncate" or "return empty". Provider behaviour
 * moves, and that note was never re-tested. This re-measures it, so the model
 * map is chosen on evidence rather than on a stale comment.
 *
 * Usage: bun run scripts/benchmark-cloud-models.ts
 */

const CANDIDATES: Array<{ provider: string; baseUrl: string; key?: string; model: string }> = [
  // Cerebras
  ...["gemma-4-31b", "gpt-oss-120b", "zai-glm-4.7"].map((model) => ({
    provider: "cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    key: process.env.CEREBRAS_API_KEY,
    model,
  })),
  // Groq
  ...["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "openai/gpt-oss-20b"].map((model) => ({
    provider: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    key: process.env.GROQ_API_KEY,
    model,
  })),
  // Gemini
  ...["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3-flash-preview"].map((model) => ({
    provider: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    key: process.env.GOOGLE_AI_STUDIO_KEY,
    model,
  })),
];

// Shaped like a real evaluator call: several required fields, a bounded score,
// and prose that has to reference the input. A model that drops a field here
// drops it in production too.
const SYSTEM =
  "You assess grant fit for an organization. Reply with ONLY a JSON object, no prose, no markdown fences.";
const USER = `Organization: an Ontario SME building AI software for Canadian small businesses, annual budget CAD 750,000.
Grant: "Regional Economic Growth Through Innovation" — federal, supports commercialization of new products by Canadian SMEs.

Return exactly this shape:
{"fit_score": <number 0-1>, "eligibility_pass": <true|false>, "rationale_en": "<2 sentences>", "risks": ["<risk>", "<risk>"]}`;

type Row = {
  provider: string;
  model: string;
  ok: boolean;
  ms: number;
  valid: boolean;
  note: string;
};

function validate(text: string): { valid: boolean; note: string } {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    return { valid: false, note: `unparseable: ${String(error).slice(0, 60)}` };
  }
  const o = parsed as Record<string, unknown>;
  const missing = ["fit_score", "eligibility_pass", "rationale_en", "risks"].filter(
    (f) => o[f] === undefined,
  );
  if (missing.length) return { valid: false, note: `missing ${missing.join(",")}` };
  if (typeof o.fit_score !== "number" || o.fit_score < 0 || o.fit_score > 1) {
    return { valid: false, note: `fit_score out of range: ${String(o.fit_score)}` };
  }
  if (!Array.isArray(o.risks)) return { valid: false, note: "risks not an array" };
  const rationale = String(o.rationale_en ?? "");
  if (rationale.length < 40)
    return { valid: false, note: `rationale too thin (${rationale.length} chars)` };
  return {
    valid: true,
    note: `fit=${o.fit_score} risks=${o.risks.length} rationale=${rationale.length}ch`,
  };
}

const rows: Row[] = [];

for (const c of CANDIDATES) {
  if (!c.key) {
    rows.push({
      provider: c.provider,
      model: c.model,
      ok: false,
      ms: 0,
      valid: false,
      note: "no key",
    });
    continue;
  }
  const started = Date.now();
  try {
    const res = await fetch(`${c.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.key}` },
      body: JSON.stringify({
        model: c.model,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: USER },
        ],
        temperature: 0.2,
        max_tokens: 2048,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      rows.push({
        provider: c.provider,
        model: c.model,
        ok: false,
        ms,
        valid: false,
        note: `HTTP ${res.status}: ${(await res.text()).slice(0, 90)}`,
      });
      continue;
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) {
      rows.push({
        provider: c.provider,
        model: c.model,
        ok: true,
        ms,
        valid: false,
        note: "empty content",
      });
      continue;
    }
    const v = validate(text);
    rows.push({ provider: c.provider, model: c.model, ok: true, ms, valid: v.valid, note: v.note });
  } catch (error) {
    rows.push({
      provider: c.provider,
      model: c.model,
      ok: false,
      ms: Date.now() - started,
      valid: false,
      note: error instanceof Error ? error.message.slice(0, 90) : String(error),
    });
  }
}

console.log("\nStructured-JSON capability by model\n" + "=".repeat(78));
for (const p of ["cerebras", "groq", "gemini"]) {
  const group = rows.filter((r) => r.provider === p);
  if (!group.length) continue;
  console.log(`\n${p}`);
  for (const r of group) {
    const mark = r.valid ? "PASS" : r.ok ? "BAD " : "ERR ";
    console.log(`  [${mark}] ${r.model.padEnd(26)} ${String(r.ms).padStart(6)}ms  ${r.note}`);
  }
}
const usable = rows.filter((r) => r.valid).sort((a, b) => a.ms - b.ms);
console.log("\n" + "=".repeat(78));
console.log(
  usable.length
    ? `Valid structured JSON from ${usable.length} model(s), fastest first:\n  ` +
        usable.map((r) => `${r.provider}/${r.model} (${r.ms}ms)`).join("\n  ")
    : "No model produced valid structured JSON",
);
