# IIAL — Evidence Pack (Canada Edition)

**Version:** 1.0.0 · **Date:** 2026-06-20 · **Jurisdiction:** Canada (data residency CA)
**Status:** Alignment, not third-party certification.

This pack consolidates the artefacts required for a privacy / AI governance
review of IIAL — the AI-native grant intelligence platform for the Canadian
market. It is intended for: internal DPO review, pilot customer due-diligence,
and TBS Directive on Automated Decision-Making (ADM) self-assessment.

## Contents

| # | Document | Purpose |
|---|---|---|
| 1 | [ADR registry](./adr-registry.md) | Architectural decisions (ADR-001 … ADR-009) |
| 2 | [DPIA](./dpia.md) | Data Protection Impact Assessment (PIPEDA + Law 25) |
| 3 | [System Card — Discoverer](./system-card-discoverer.md) | Agent transparency (EN/FR) |
| 4 | [System Card — Evaluator](./system-card-evaluator.md) | Agent transparency (EN/FR) |
| 5 | [System Card — Writer](./system-card-writer.md) | Agent transparency (EN/FR) |
| 6 | [System Card — Critic](./system-card-critic.md) | Agent transparency (EN/FR) |
| 7 | [Pen-test checklist](./pentest-checklist.md) | Pre-launch security tests |
| 8 | [Pen-test report 2026-06-20](./pentest-report-2026-06-20.md) | First production checklist run |
| 9 | [Incident runbook](./incident-runbook.md) | Detection · containment · notification |

## Frameworks referenced

- **PIPEDA** — Personal Information Protection and Electronic Documents Act
- **Quebec Law 25** — Act to modernize legislative provisions as regards the protection of personal information
- **AIDA / Bill C-27** — Artificial Intelligence and Data Act (proposed)
- **TBS Directive on Automated Decision-Making** — Treasury Board of Canada
- **OECD AI Principles** · **NIST AI RMF 1.0** (informative)

> ⚠️ This pack documents **alignment** with the above frameworks. It is not a
> certification by any third party. Customers requiring formal attestations
> (SOC 2, ISO 27001) should request a separate roadmap.
