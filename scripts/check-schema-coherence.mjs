// Deterministic logic<->DB coherence check (0 cloud tokens).
// Verifies every PostgREST .select()/embed column referenced in source against
// the LIVE database schema. Catches wrong columns that tsc cannot see inside
// nested embed strings (e.g. grants amount_min_cad vs amount_cad_min).
//
// Usage: node scripts/check-schema-coherence.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

// 1) Live schema: table -> Set(columns). Includes tables + views.
const raw = execSync(
  `docker exec docker-db-1 psql -U postgres -d postgres -t -A -F "|" -c "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'"`,
  { encoding: "utf8" },
);
const schema = {};
for (const line of raw.trim().split("\n")) {
  const [t, c] = line.split("|");
  if (!t) continue;
  (schema[t] ??= new Set()).add(c);
}
const knownTables = new Set(Object.keys(schema));

// 2) Collect source files.
function walk(d) {
  let out = [];
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    const s = statSync(p);
    if (s.isDirectory()) out = out.concat(walk(p));
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\./.test(e)) out.push(p);
  }
  return out;
}
const files = walk("src");

// 3) Parse a select body into {table -> [columns]} respecting embeds.
function readStringArg(s, openIdx) {
  // openIdx points at "(" of .select( . Find the first quote and read to its match.
  let i = openIdx + 1;
  while (i < s.length && /\s/.test(s[i])) i++;
  const q = s[i];
  if (q !== '"' && q !== "'" && q !== "`") return null;
  let j = i + 1,
    buf = "";
  while (j < s.length && s[j] !== q) {
    buf += s[j];
    j++;
  }
  return buf;
}
function splitTop(body) {
  const parts = [];
  let depth = 0,
    cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}
const problems = [];
function checkFields(table, body, file) {
  if (!knownTables.has(table)) return; // unknown/external table; skip
  for (let tok of splitTop(body)) {
    tok = tok.trim();
    if (!tok) continue;
    const paren = tok.indexOf("(");
    if (paren !== -1) {
      // embed: [alias:]table[!hint](inner)
      let head = tok.slice(0, paren).trim();
      const inner = tok.slice(paren + 1, tok.lastIndexOf(")"));
      if (head.includes(":")) head = head.slice(head.indexOf(":") + 1);
      head = head.split("!")[0].trim();
      checkFields(head, inner, file);
      continue;
    }
    // plain column, possibly alias:column or json col->>'k'
    let col = tok;
    if (col.includes(":")) col = col.slice(col.indexOf(":") + 1); // rename alias:col
    col = col.split("->")[0].split("::")[0].trim();
    if (!col || col === "*" || col === "count") continue;
    if (!/^[a-z_][a-z0-9_]*$/i.test(col)) continue; // skip anything exotic
    if (!schema[table].has(col)) {
      problems.push({ file, table, col });
    }
  }
}

// 4) Scan: associate each .select(<string>) with the nearest preceding .from("T").
for (const file of files) {
  const src = readFileSync(file, "utf8");
  // Capture the table regardless of a trailing cast, e.g. .from("t" as never)
  const fromRe = /\.from\(\s*["'`](\w+)["'`]/g;
  const froms = [];
  let m;
  while ((m = fromRe.exec(src))) froms.push({ idx: m.index, table: m[1] });
  const selRe = /\.select\(/g;
  while ((m = selRe.exec(src))) {
    const body = readStringArg(src, m.index + ".select".length);
    if (!body) continue;
    // nearest .from before this select
    let table = null;
    for (const f of froms) if (f.idx < m.index) table = f.table;
    if (!table) continue;
    checkFields(table, body, file.replace(/\\/g, "/"));
  }
}

if (!problems.length) {
  console.log("OK: every .select()/embed column exists in the live DB schema.");
} else {
  console.log(`FOUND ${problems.length} column mismatch(es):`);
  for (const p of problems) console.log(`  ${p.table}.${p.col}  <-  ${p.file}`);
}
