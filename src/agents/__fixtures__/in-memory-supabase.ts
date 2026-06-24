// Minimal in-memory Supabase mock for E2E tests. Supports the subset of the
// PostgREST builder used by IIAL agents: select/insert/update/upsert/delete,
// eq/in/not/is, order/limit, maybeSingle, rpc, and the nested-FK select
// pattern `funder:funders(...)` via a tiny registry.
//
// Returns thenable chains so callers can either `await q` to get all rows or
// `await q.maybeSingle()` for the first row. Filters are AND-composed.

export type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;
type Order = { col: string; ascending: boolean; nullsFirst: boolean };

export type ForeignRel = {
  // For each row in `table`, foreignKey on the row joins to `target.id`.
  // alias is the field name returned to the caller (e.g. "funder").
  alias: string; foreignKey: string; target: string;
};

export type InMemoryDb = {
  tables: Record<string, Row[]>;
  relations: Record<string, ForeignRel[]>;
  rpc: Record<string, (args: Row) => unknown>;
};

export function createInMemoryDb(seed: Partial<InMemoryDb> = {}): InMemoryDb {
  return {
    tables: seed.tables ?? {},
    relations: seed.relations ?? {},
    rpc: seed.rpc ?? {},
  };
}

export function makeSupabaseMock(db: InMemoryDb) {
  return {
    from(table: string) { return makeBuilder(db, table); },
    rpc(name: string, args?: Row) {
      const fn = db.rpc[name];
      const data = fn ? fn(args ?? {}) : null;
      return Promise.resolve({ data, error: null });
    },
  };
}

function applyRelations(db: InMemoryDb, table: string, rows: Row[], cols: string): Row[] {
  // Parse nested patterns like "id, title, funder:funders(name, jurisdiction)".
  const rels = db.relations[table] ?? [];
  const nestedRe = /(\w+):(\w+)\(([^)]*)\)/g;
  const matches = [...cols.matchAll(nestedRe)];
  if (matches.length === 0) return rows;
  return rows.map((r) => {
    const out: Row = { ...r };
    for (const m of matches) {
      const alias = m[1]; const targetTable = m[2];
      const rel = rels.find((x) => x.alias === alias && x.target === targetTable);
      const fk = rel?.foreignKey ?? `${alias}_id`;
      const target = (db.tables[targetTable] ?? []).find((t) => t.id === r[fk]);
      out[alias] = target ?? null;
    }
    return out;
  });
}

function makeBuilder(db: InMemoryDb, table: string) {
  const filters: Filter[] = [];
  let order: Order | null = null;
  let limitN: number | null = null;
  let selectedCols = "*";
  let pendingOp: { kind: "insert" | "update" | "upsert" | "delete"; payload?: Row | Row[]; conflict?: string } | null = null;

  if (!db.tables[table]) db.tables[table] = [];

  function rowsMatching(): Row[] { return db.tables[table].filter((r) => filters.every((f) => f(r))); }

  function exec(): { data: Row[] | Row | null; error: null } {
    if (pendingOp?.kind === "insert") {
      const rows = Array.isArray(pendingOp.payload) ? pendingOp.payload : [pendingOp.payload!];
      const inserted: Row[] = [];
      for (const r of rows) {
        const row = {
          id: r.id ?? `id_${db.tables[table].length + 1}_${Math.random().toString(36).slice(2, 7)}`,
          // Auto-stamp created_at to mimic Postgres `default now()` columns
          // that production tables (grant_events, agent_runs, ...) rely on.
          created_at: r.created_at ?? new Date().toISOString(),
          ...r,
        };
        db.tables[table].push(row); inserted.push(row);
      }
      return { data: inserted, error: null };
    }
    if (pendingOp?.kind === "upsert") {
      const rows = Array.isArray(pendingOp.payload) ? pendingOp.payload : [pendingOp.payload!];
      const conflictCols = (pendingOp.conflict ?? "id").split(",").map((c) => c.trim());
      const upserted: Row[] = [];
      for (const r of rows) {
        const idx = db.tables[table].findIndex((x) => conflictCols.every((c) => x[c] === r[c]));
        if (idx >= 0) { db.tables[table][idx] = { ...db.tables[table][idx], ...r }; upserted.push(db.tables[table][idx]); }
        else { const row = { id: r.id ?? `id_${db.tables[table].length + 1}`, ...r }; db.tables[table].push(row); upserted.push(row); }
      }
      return { data: upserted, error: null };
    }
    if (pendingOp?.kind === "update") {
      const targets = rowsMatching();
      for (const r of targets) Object.assign(r, pendingOp.payload ?? {});
      return { data: targets, error: null };
    }
    if (pendingOp?.kind === "delete") {
      const targets = rowsMatching();
      db.tables[table] = db.tables[table].filter((r) => !targets.includes(r));
      return { data: targets, error: null };
    }
    let rows = rowsMatching();
    if (order) {
      const { col, ascending, nullsFirst } = order;
      rows = [...rows].sort((a, b) => {
        const va = a[col]; const vb = b[col];
        if (va == null && vb == null) return 0;
        if (va == null) return nullsFirst ? -1 : 1;
        if (vb == null) return nullsFirst ? 1 : -1;
        if (va < vb) return ascending ? -1 : 1;
        if (va > vb) return ascending ? 1 : -1;
        return 0;
      });
    }
    if (limitN != null) rows = rows.slice(0, limitN);
    rows = applyRelations(db, table, rows, selectedCols);
    return { data: rows, error: null };
  }

  const builder = {
    select(cols = "*") { selectedCols = cols; return builder; },
    eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return builder; },
    in(col: string, vals: unknown[]) { filters.push((r) => vals.includes(r[col])); return builder; },
    not(col: string, op: string, val: unknown) {
      filters.push((r) => {
        if (op === "is" && val === null) return r[col] != null;
        return r[col] !== val;
      });
      return builder;
    },
    is(col: string, val: unknown) { filters.push((r) => r[col] === val); return builder; },
    order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
      order = { col, ascending: opts.ascending ?? true, nullsFirst: opts.nullsFirst ?? false };
      return builder;
    },
    limit(n: number) { limitN = n; return builder; },
    maybeSingle() {
      const r = exec();
      const first = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
      return Promise.resolve({ data: first, error: null });
    },
    single() { return builder.maybeSingle(); },
    insert(payload: Row | Row[]) { pendingOp = { kind: "insert", payload }; return builder; },
    update(payload: Row) { pendingOp = { kind: "update", payload }; return builder; },
    upsert(payload: Row | Row[], opts: { onConflict?: string } = {}) {
      pendingOp = { kind: "upsert", payload, conflict: opts.onConflict }; return builder;
    },
    delete() { pendingOp = { kind: "delete" }; return builder; },
    // Thenable: `await q` resolves to { data, error }.
    then<T1, T2>(resolve: (v: { data: Row[] | Row | null; error: null }) => T1, reject?: (e: unknown) => T2) {
      try { return Promise.resolve(exec()).then(resolve, reject); }
      catch (e) { return Promise.reject(e).catch(reject as never); }
    },
  };
  return builder;
}
