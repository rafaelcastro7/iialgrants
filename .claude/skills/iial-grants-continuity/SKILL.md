---
name: iial-grants-continuity
description: Preserve verified Claude and Codex contracts when changing IIAL Grants tenancy, profiles, RAG, agents, migrations, or V2 workflows.
---

# IIAL Grants Continuity

## Overview

Use this skill before modifying any cross-cutting IIAL Grants capability. It keeps work compatible with verified Claude findings, the current tenant model, and the GrantDesk successor without blindly porting the successor's narrower product shape.

## When to use

Use for changes to `AGENTS.md`, handoffs, Supabase migrations/RLS, tenant queries, organization profile, knowledge/RAG, agent workflows, V2 routes, or test infrastructure. Also use when resuming work after another agent or when a historical handoff conflicts with the current code.

## Continuity workflow

1. Read `AGENTS.md`, `docs/HANDOFF-CODEX.md`, this skill, and—when shared architecture is involved—`e:/dev/grantdesk/CLAUDE.md`.
2. Inspect the current call sites, RLS policies, and latest migrations. Treat them as authoritative over stale handoff prose.
3. State the compatibility contract before editing: principal, data owner, user-visible gate, and fallbacks.
4. Make the smallest coherent change across schema, server functions, UI and tests. Do not introduce a parallel per-user path for shared tenant facts.
5. Verify focused tests first, then lint and build. For schema work, ensure PostgREST has refreshed its schema cache before interpreting API failures.
6. Update `docs/HANDOFF-CODEX.md` with facts, migration names, validation evidence, and intentionally unresolved product decisions.

## Non-negotiable contracts

- `profiles.org_id` establishes the tenant principal. Service-role handlers must enforce the existing tenant-access guard before using resource IDs.
- `org_profiles` is tenant-shared, and its core readiness facts must be real; do not manufacture IIAL data to improve a score.
- `knowledge_chunks` and `answer_library` are tenant-scoped shared knowledge. Preserve both lexical and vector retrieval, and remove archived answers from retrieval.
- Cloud inference is intentional; local Ollama is the resilience floor. Do not restore obsolete absolute-locality messaging.
- A `*.functions.ts` file may reach the client bundle. It cannot statically import a `*.server.ts` file. Use a non-server pure helper or dynamic import.
- Never rewrite published Git history in this Lovable-connected repository.

## Product compatibility lens

GrantDesk contributes validated patterns—fast profile onboarding, explicit pass/fail/unknown eligibility, trustworthy search coverage, requirement-driven drafting, named blockers and human confirmation. Apply those patterns only when they fit IIAL's broader workflow, bilingual Canadian context, six-agent pipeline and existing audit/compliance lifecycle.

## Operational checks

- Run unit and Playwright runners through their existing `bun run` scripts (which use real Node); avoid raw `bunx` browser launches.
- After dependency changes, restart Vite and clear its optimizer cache.
- Before debugging a missing writer result, check the tenant has profile or answer/document knowledge and `nomic-embed-text` is available.
- Reproduce browser-render failures in their focused test before treating a full-suite resource-contention failure as a source defect.

## Reference

Read `references/compatibility-contract.md` for the concise data-flow and verification matrix. The detailed evidence remains in `docs/HANDOFF-CODEX.md`.
