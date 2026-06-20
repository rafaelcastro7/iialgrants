# Incident Response Runbook

Aligns with PIPEDA breach-notification (s. 10.1) and Quebec Law 25
(Art. 3.5–3.8 — confidentiality incidents).

## Severity

| Sev | Definition | Examples |
|---|---|---|
| SEV-1 | Confirmed PII exposure or data integrity loss | RLS bypass, DB exfil, ransomware |
| SEV-2 | Likely exposure or auth compromise | Token leak, admin account takeover |
| SEV-3 | Degraded service, no PII risk | Agent error rate > 20 %, OTLP outage |
| SEV-4 | Cosmetic / single-user | i18n typo, broken non-critical link |

## Phases

### 1. Detect
Sources: OTel error rate, Supabase audit, user report, `/ops` dashboard,
security@iial.ca inbox.

### 2. Triage (within 30 min)
- Open incident channel
- Assign Incident Commander (IC) + Scribe
- Classify severity (above)
- For SEV-1/2: page DPO immediately

### 3. Contain
- Rotate compromised secrets (`secrets--rotate_lovable_api_key` if AI Gateway key)
- Revoke compromised sessions (`auth.users` ban, force re-auth)
- Disable affected feature flag / route if isolation possible
- Snapshot `audit_log` for forensics

### 4. Eradicate & recover
- Deploy patch (must pass all 5 EDD gates)
- Verify fix in preview, then publish
- Post-recovery scan: `security--run_security_scan`

### 5. Notify (SEV-1 only)
- **Office of the Privacy Commissioner of Canada (OPC):** as soon as
  feasible, using the prescribed PIPEDA breach report.
- **Commission d'accès à l'information du Québec (CAI):** sans délai
  (Law 25 — incident affecting Quebec residents).
- **Affected users:** clear, plain-language EN + FR notice describing
  the breach, data involved, mitigations, and steps they can take.
- **Record in breach register** (kept ≥ 24 months — PIPEDA s. 10.3).

### 6. Post-mortem (within 7 days)
- Blameless write-up
- Action items with owners and dates
- Add an adversarial test to Gate 5 covering the failure mode
- Update this runbook if process gaps emerged

## Contacts (template — fill before pilot)

| Role | Name | Channel |
|---|---|---|
| DPO | TBD | dpo@iial.ca |
| Incident Commander on-call | TBD | PagerDuty |
| Legal counsel | TBD | counsel@iial.ca |
| OPC liaison | OPC general | https://www.priv.gc.ca |
| CAI liaison | CAI general | https://www.cai.gouv.qc.ca |
