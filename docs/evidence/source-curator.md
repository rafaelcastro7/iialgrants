# Source Curator Agent — Evidence

## EN

**Purpose.** Continuously grow the IIAL funder catalog by ingesting Canadian
public open-data sources, deduplicating against existing funders, scoring,
and routing candidates for auto-approval or human review.

**Sources (Phase 1).**
- **TBS Proactive Disclosure G&C** (`open.canada.ca`, CKAN datastore SQL,
  resource `1d15a62f-5656-49ad-8c88-f40ce689d831`). Last 35 days. We only
  surface recipients matching re-granting keywords (foundation/community
  trust/society/council/association) — these are the regrantors that fund
  third parties.
- **PFC Member List** (`pfc.ca/memberslist/`) via Firecrawl JSON extraction.
  ~200 tier-1 Canadian foundations.

**Out of scope (postponed).** CRA T3010 bulk CSV (~86k charities, too heavy
for the Worker runtime — needs a paginated CKAN strategy or external worker).
Provincial CKAN ingest (BC/QC/AB). Innovation Canada XLSX. RSS social
listening (already covered by `rss-poll`).

**Scoring (0-100).** BN +25, disbursed amount >0 +20, website +15, multiple
signals +10, province +5, type +5, valid CA province +5. Auto-approve ≥ 80;
review 40-79; silent drop < 40.

**Dedup.** Primary: CRA BN (9 digits). Secondary: Dice-coefficient bigram
similarity ≥ 0.88 on normalized names (strips "Foundation/Inc/Ltd/Society").

**Cadence.** Monthly via pg_cron → `/api/public/hooks/source-curator`.
On-demand via admin UI "Run curator now".

**Human oversight.** All `pending_review` candidates require admin approval
in `/admin/candidates` before they reach `funders`. Rejected candidates
remember `reject_reason` for audit.

**Telemetry.** Every run logs to `source_ingest_runs` (dataset, rows_in,
candidates_out, auto_approved, duplicates, errors, latency_ms).

**Stack.** 100% Lovable Cloud + Firecrawl. Model: `google/gemini-2.5-flash`
(only used implicitly through Firecrawl's JSON extraction).

## FR-CA

**Objet.** Faire croître le catalogue de bailleurs IIAL en ingérant des
sources canadiennes de données ouvertes, en dédupliquant, en notant et en
acheminant les candidats vers l'approbation automatique ou la révision
humaine.

**Sources.** Divulgation proactive S&C du SCT (CKAN, 35 derniers jours,
mots-clés de re-octroi) ; liste des membres de la FPC (Firecrawl).

**Hors champ.** Liste annuelle des organismes de bienfaisance T3010 (volume
trop élevé pour le runtime Worker), CKAN provinciaux, Innovation Canada XLSX.

**Notation 0-100.** NE +25, montants octroyés > 0 +20, site web +15,
signaux multiples +10, province +5, type +5, province CA valide +5.
Approbation auto ≥ 80 ; révision 40-79 ; rejet silencieux < 40.

**Cadence.** Mensuelle via pg_cron. À la demande via l'IU admin.
