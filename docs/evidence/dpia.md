# DPIA — Data Protection Impact Assessment

**Product:** IIAL · **Version:** 1.0 · **Date:** 2026-06-20
**Author:** IIAL DPO · **Reviewers:** Engineering Lead, Legal Counsel
**Frameworks:** PIPEDA · Quebec Law 25 (Art. 3.3) · AIDA (Bill C-27) · TBS Directive on ADM

## 1. Project description

IIAL helps Canadian organizations discover, evaluate and draft grant
proposals through a pipeline of six specialized LLM agents. The platform
processes organization profiles, public grant data, and user-authored
knowledge base content. No grant submission is automated end-to-end —
human review (`Submit` action) is always required before any external
disclosure.

## 2. Personal information processed

| Category | Examples | Source | Retention |
|---|---|---|---|
| Identity | email, display name | User signup | Account lifetime + 30d |
| Org profile | legal name, sector, address | User input | Account lifetime |
| Authored content | proposal text, knowledge chunks | User input | Account lifetime |
| Audit | action, resource, ts, ip | System | 7 years (PIPEDA) |
| Consent ledger | type, action, policy version, lang | System | 7 years (Law 25 burden of proof) |

**Sensitive categories.** None by design — IIAL is not for health, biometric,
or financial PII. Users are warned in onboarding.

## 3. Purposes and legal basis

| Purpose | Basis (PIPEDA) | Basis (Law 25) |
|---|---|---|
| Provide service | Contract | Necessary for service |
| AI inference | Consent (`ai_processing`) | Explicit, granular consent |
| Cross-border LLM call | Consent (`cross_border_transfer`) | PIA + consent (Art. 17) |
| Compliance & audit | Legal obligation | Legal obligation |

## 4. Data flows

```
User (CA) → Lovable Cloud DB (CA region)
                     │
                     ├── RLS-scoped reads ──→ Server functions (CA Worker)
                     │                              │
                     │                              └── Lovable AI Gateway → Gemini API
                     │                                      (cross-border, with consent)
                     │
                     └── OTel logs → OTLP endpoint (configurable, CA-preferred)
```

## 5. Risks and mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Hallucinated citations in proposals | Med | High | ADR-005, Gate 1 (4 tests) |
| R2 | Prompt injection from grant text | High | Med | Gate 5 adversarial + system-prompt isolation |
| R3 | Cross-tenant knowledge leakage | Low | Critical | RLS per `user_id`; SECINVOKER on RAG RPC |
| R4 | Role escalation via profile write | Low | Critical | ADR-007; roles in separate table |
| R5 | PII in agent logs | Med | High | OTel records token counts, not content |
| R6 | Stale consent (policy update) | Med | Med | Versioned consent ledger; revalidation on bump |
| R7 | Right-of-erasure unfulfilled | Low | High | DSAR `delete` request + audit log |
| R8 | LLM cost runaway | Med | Low | Per-agent ceilings + Pro share alert |

## 6. Data subject rights (PIPEDA + Law 25)

| Right | Surface |
|---|---|
| Access | `/privacy` → "Export my data" |
| Portability | JSON bundle `iial.dsar.export.v1` |
| Rectification | DSAR request kind `rectify` |
| Erasure | DSAR request kind `delete` (admin-verified) |
| Withdraw consent | `/privacy` consent manager |
| Object to ADM | No fully automated decision is taken; human-in-the-loop on every submission |

## 7. Automated decision-making (TBS Directive — self-assessment)

- **Impact level:** II (limited) — recommendations only, no eligibility
  decision is final without human review.
- **Transparency:** System Cards published per agent (this pack).
- **Quality assurance:** EDD Gates 1–5 in CI.
- **Recourse:** users can edit any draft, override any score, request
  manual review of any evaluation.

## 8. Residual risk

After mitigations, residual risk is assessed **Low**. The DPO accepts the
residual risk subject to: (a) quarterly review of System Cards,
(b) annual external pen-test, (c) bilingual update to `/compliance` on every
policy version bump.

**Sign-off:** IIAL DPO — 2026-06-20
