# ADR Registry — IIAL Canada

Architectural Decision Records. Each ADR is immutable once accepted; changes
are tracked as new ADRs that supersede the previous one.

| ID | Title | Status | Date |
|---|---|---|---|
| ADR-001 | TanStack Start + Lovable Cloud as platform | Accepted | 2026-06-19 |
| ADR-002 | Six-agent LLM pipeline (Discoverer → Critic) | Accepted | 2026-06-19 |
| ADR-003 | Gemini 2.5 Flash default, Pro for Critic (cascade) | Accepted | 2026-06-19 |
| ADR-004 | Hybrid RAG: BM25 ∪ pgvector, fused with RRF (k=60) | Accepted | 2026-06-19 |
| ADR-005 | Mandatory citation validation (no marker → reject) | Accepted | 2026-06-19 |
| ADR-006 | Data residency: Canada (Lovable Cloud CA region) | Accepted | 2026-06-19 |
| ADR-007 | Roles in separate `user_roles` table + `has_role()` SECDEF | Accepted | 2026-06-19 |
| ADR-008 | Bilingual EN/FR-CA mandatory on every customer-facing surface | Accepted | 2026-06-19 |
| ADR-009 | Evals-Driven Development — 5 CI gates block merge | Accepted | 2026-06-19 |

---

## ADR-001 — Platform

**Context.** Need an edge-deployed, type-safe full-stack stack with first-class
auth, RLS-backed Postgres, pgvector and CA data residency.
**Decision.** TanStack Start v1 on Cloudflare Workers + Lovable Cloud (Supabase, CA).
**Consequences.** No Node-only deps in server code; `pdf-lib`, `sharp` out;
`createServerFn` is the canonical RPC; webhooks under `/api/public/*`.

## ADR-002 — Six agents

**Context.** Single monolithic prompt collapses quality and observability.
**Decision.** Pipeline = Discoverer → Enricher → Evaluator → Strategist →
Writer → Critic. Each agent owns one verb, one schema, one trace.
**Consequences.** Per-agent OTel metrics; per-agent golden sets; per-agent
cost ceilings.

## ADR-003 — Model cascade

**Context.** Pro is ~5× the cost of Flash; most steps don't need it.
**Decision.** Flash for Discoverer / Enricher / Evaluator / Strategist /
Writer. Pro only for Critic (high-stakes scoring). Embeddings:
`text-embedding-3-small` (1536).
**Consequences.** Cost ceiling enforced in `agent_runs.cost_usd`; alert if
weekly Pro share > 25 %.

## ADR-004 — Hybrid RAG

**Context.** Pure vector recall misses exact eligibility keywords; pure BM25
misses paraphrases.
**Decision.** `match_knowledge_chunks` runs BM25 (FTS GIN) ∪ HNSW cosine and
fuses with Reciprocal Rank Fusion, k=60. SECURITY INVOKER + RLS.
**Consequences.** No knowledge crosses tenant boundary; recall measured on
golden set in Gate 1.

## ADR-005 — Citation safety

**Context.** Hallucinated citations are the #1 risk in proposal generation.
**Decision.** Writer must emit `[d1]..[dN]` markers; `validateCitations()`
rejects any marker not present in retrieved chunk set. Drafts without
citations are saved as `draft_unsafe` and never auto-submitted.
**Consequences.** Gate 1 has 4 unit tests dedicated to this invariant.

## ADR-006 — Data residency

**Context.** Quebec Law 25 §17 requires PIA before cross-border transfer.
**Decision.** Primary storage in CA. Cross-border (LLM inference via
Lovable AI Gateway) is opt-in via `cross_border_transfer` consent.
**Consequences.** `consent_ledger` tracks per-user transfer consent;
`/compliance` discloses sub-processors.

## ADR-007 — Roles

**Context.** Roles on `profiles` ⇒ trivial privilege escalation.
**Decision.** Separate `user_roles` table; `has_role(uuid, app_role)` is
SECDEF with `search_path = public`; EXECUTE revoked from anon/authenticated;
only RLS engine invokes it.
**Consequences.** Admin checks are server-side only.

## ADR-008 — Bilingual

**Context.** Quebec Law 25 requires French; federal grants require both.
**Decision.** Every user-facing string lives in `en.json` + `fr.json`.
Writer produces EN + FR-CA in the same call. Critic findings bilingual.
**Consequences.** Missing FR string = failing test (planned Gate 6).

## ADR-009 — EDD gates

**Context.** LLM regressions are silent without continuous evals.
**Decision.** 5 gates in CI:
1. Unit (schemas + validators)
2. Golden regression (Evaluator + Writer)
3. LLM-as-judge (Evaluator)
4. Pairwise A/B (Writer prompt variants)
5. Adversarial (prompt-injection, jurisdiction, sector, stage)

**Consequences.** Any failing gate blocks merge.
