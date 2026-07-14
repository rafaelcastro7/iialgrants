# IIAL Grants User Manual

Professional user guide for the IIAL Grants platform.

Last updated: 2026-07-14

## Table of Contents

1. [Purpose of the System](#purpose-of-the-system)
2. [How to Open the Platform](#how-to-open-the-platform)
3. [Core Concepts](#core-concepts)
4. [Main Navigation](#main-navigation)
5. [End-to-End Grant Workflow](#end-to-end-grant-workflow)
6. [Dashboard](#dashboard)
7. [Grant Intelligence](#grant-intelligence)
8. [Grant Detail Page](#grant-detail-page)
9. [Funder Intelligence](#funder-intelligence)
10. [Fit Rules](#fit-rules)
11. [Proposal Workspace](#proposal-workspace)
12. [Proposal Quality and Revision](#proposal-quality-and-revision)
13. [Submissions](#submissions)
14. [Post-Award Management](#post-award-management)
15. [Competitive Intelligence](#competitive-intelligence)
16. [Operations and Collaboration](#operations-and-collaboration)
17. [Organization Profile](#organization-profile)
18. [Compliance and Privacy](#compliance-and-privacy)
19. [Administration](#administration)
20. [Autonomous Improvement System](#autonomous-improvement-system)
21. [Evidence, Auditability, and Trust](#evidence-auditability-and-trust)
22. [Recommended Operating Rhythm](#recommended-operating-rhythm)
23. [Troubleshooting](#troubleshooting)
24. [Glossary](#glossary)

## Purpose of the System

IIAL Grants is an AI-native grant intelligence platform for Canadian funding
opportunities. It helps an organization discover, evaluate, prioritize, draft,
submit, and manage grants from first lead through post-award reporting.

The system is designed for teams that need more than a static grant directory.
It combines grant discovery, structured enrichment, local AI evaluation,
proposal drafting, evidence tracking, team workflows, quality review,
competitive intelligence, and post-award management in one workspace.

The platform is local-first:

- Data is stored in local Supabase/PostgreSQL.
- AI inference runs through local Ollama models.
- The application runs locally at `http://localhost:8080`.
- The operating model is designed for zero cloud LLM token cost.
- Evidence, audit trails, and scoring rationale are retained for review.

## How to Open the Platform

If the local server is already running, open:

```text
http://localhost:8080/grants
```

Common direct links:

| Area               | URL                               |
| ------------------ | --------------------------------- |
| Grant catalog      | `http://localhost:8080/grants`    |
| Dashboard          | `http://localhost:8080/dashboard` |
| Proposals          | `http://localhost:8080/proposals` |
| Funders            | `http://localhost:8080/funders`   |
| Autonomy dashboard | `http://localhost:8080/autonomy`  |
| Admin console      | `http://localhost:8080/admin`     |

If the server is not running, start it from the project folder:

```bash
bun run dev
```

On Windows, the project also includes launcher and 24/7 operation scripts that
can start the daemon system and open the app automatically.

## Core Concepts

### Grants

A grant is a funding opportunity discovered from a funder, public source, or
curated source list. It may begin as a simple lead and become progressively more
complete as the system fetches details, extracts facts, and evaluates fit.

### Funders

A funder is the organization behind one or more funding opportunities. Funder
records may include jurisdiction, source URLs, CRA/T3010 enrichment, giving
patterns, and related programs.

### Enrichment

Enrichment is the process of fetching official pages and extracting structured
fields such as amount, deadline, eligibility, sector, requirements, and source
evidence.

### Fit Evaluation

Fit evaluation combines deterministic rules with local LLM analysis. The result
is a fit score, eligibility decision, rationale, and axis breakdown that help
decide whether a grant deserves proposal effort.

### Proposal

A proposal is the work product created after deciding to pursue a grant. It can
include sections, documents, citations, readiness checks, quality review, and
submission tracking.

### Evidence

Evidence connects extracted facts and AI-generated decisions back to source
material. The user should treat evidence as the trust layer: it explains where
the system got its information and why a decision was made.

### Autonomy

Autonomy refers to the local daemon fleet that continuously audits the system,
measures data quality, identifies weaknesses, and proposes improvements.

## Main Navigation

The sidebar organizes the platform into work areas.

| Section             | Main Pages                                         | Purpose                                                             |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| Dashboard           | `/dashboard`                                       | Executive overview of activity and status                           |
| Discover            | `/grants`, `/funders`, `/fit-rules`                | Find grants, understand funders, configure fit rules                |
| Pipeline            | `/proposals`, `/quality`, `/submissions`           | Draft, review, improve, and submit proposals                        |
| Post-award          | `/post-award`, `/financial`, `/impact`, `/renewal` | Manage awarded grants, outcomes, reporting, and renewal             |
| Operations          | `/tasks`, `/compliance-calendar`                   | Coordinate team work and deadlines                                  |
| Market intelligence | `/competitive`                                     | Analyze public grant markets, programs, and recipients              |
| Workspace           | `/org`, `/compliance`, `/privacy`                  | Configure organization and review governance pages                  |
| Admin               | `/autonomy`, `/ops`, `/admin/*`                    | Manage system operations, agents, sources, users, and audit history |

The interface includes theme controls, notifications, a user menu, responsive
mobile navigation, and an optional UI version toggle where enabled.

## End-to-End Grant Workflow

The normal workflow is:

1. Discover grants.
2. Fetch and enrich grant details.
3. Review extracted data and evidence.
4. Evaluate organizational fit.
5. Shortlist promising opportunities.
6. Draft a proposal.
7. Attach supporting documents.
8. Run quality and readiness checks.
9. Submit the proposal.
10. Track outcomes, reporting deadlines, impact, and renewal opportunities.

### Workflow Statuses

| Status        | Meaning                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| `discovered`  | The system found a potential opportunity, but details may still be incomplete |
| `enriched`    | Core facts have been fetched and structured                                   |
| `scored`      | Fit evaluation exists for the grant                                           |
| `shortlisted` | The opportunity is actively being considered                                  |
| `in_proposal` | A proposal workflow is attached                                               |
| `submitted`   | The application has been sent to the funder                                   |
| `won`         | The grant was awarded                                                         |
| `lost`        | The grant was not awarded                                                     |
| `expired`     | The deadline passed                                                           |
| `archived`    | The record is retained but no longer active                                   |

## Dashboard

The dashboard is the starting point for understanding the current state of the
workspace. It is designed for quick scanning, not detailed editing.

Use it to:

- Review recent platform activity.
- See pipeline movement.
- Identify urgent deadlines or operational issues.
- Jump into grants, proposals, tasks, or admin areas.

Recommended use:

- Start each work session here.
- Look for new activity, alerts, and stale work.
- Move into the relevant module for detailed action.

## Grant Intelligence

The grant catalog is the main workspace for discovery and qualification.

Open it at:

```text
/grants
```

Use the grant catalog to:

- Search across grant opportunities.
- Filter by jurisdiction, funder, deadline, and eligibility.
- Sort grants by priority, fit, deadline, or value.
- See active pipeline stages.
- Launch discovery jobs.
- Fetch missing details for discovered grants.
- Evaluate fit for enriched grants.
- Draft proposals for qualified grants.
- Open the full grant detail page.

### Pipeline View

The grant workspace groups opportunities by business stage:

| Stage    | Typical Statuses              | Meaning                                             |
| -------- | ----------------------------- | --------------------------------------------------- |
| Discover | `discovered`                  | New leads needing verification                      |
| Qualify  | `enriched`, `scored`          | Structured facts and fit checks are being assembled |
| Pursue   | `shortlisted`, `in_proposal`  | Opportunities worth proposal effort                 |
| Submit   | `submitted`                   | Applications awaiting response                      |
| Award    | `won`                         | Funded opportunities requiring management           |
| Close    | `lost`, `expired`, `archived` | Closed or deprioritized opportunities               |

### Search and Filters

Use filters to reduce noise:

- Search by grant title, funder, or keywords.
- Filter by jurisdiction.
- Select one or more funders.
- Show only eligible opportunities.
- Show only grants with known deadlines.
- Sort by highest-value or most urgent opportunities.

### Discovery

Admin users can run discovery actions that add or refresh grant leads from
configured sources. Newly discovered grants should be reviewed before they are
treated as actionable.

### Enrichment

Enrichment fetches official detail pages and tries to extract:

- Summary.
- Amount range.
- Deadline.
- Eligibility.
- Sectors.
- Application requirements.
- Source/evidence trail.

If a funder page does not publish a key field, the system should preserve that
uncertainty instead of inventing a value.

## Grant Detail Page

Open a grant detail page from the catalog or directly:

```text
/grants/:id
```

The grant detail page is the professional decision page for one opportunity.

It includes:

- Grant title, funder, jurisdiction, source page, and status.
- Fit verdict and fit score.
- Deadline state and urgency.
- Amount range, if available.
- Eligibility details.
- Sector tags.
- Requirements and critical requirements.
- Evaluation rationale.
- Deterministic axis breakdown.
- Evidence chips and source references.
- Fetch trail showing how pages were gathered.
- Audit link.
- Opportunity brief tools.
- NotebookLM bridge where enabled.
- Actions to fetch details, evaluate, shortlist, draft, share, or open the
  official source.

### How to Read the Detail Page

Start with these questions:

1. Is the source official and current?
2. Is the deadline known and still actionable?
3. Is the amount worth the proposal effort?
4. Does eligibility clearly allow the organization to apply?
5. Does the fit rationale make sense?
6. Are any critical requirements missing or unresolved?
7. Is there enough evidence to trust the recommendation?

### Fit Score

The fit score is a decision-support signal, not an automatic command. It should
be reviewed with the rationale, eligibility result, deadline, and requirements.

High fit means the system believes the grant is promising. Low fit usually means
the opportunity is ineligible, strategically weak, too late, too small, or too
burdensome.

### Partial Data

Some records may contain a `partial_enrichment_review` note. This means the
system found useful data but not every key field. Treat these as reviewable but
not fully complete.

## Funder Intelligence

Open funders at:

```text
/funders
```

Use funder intelligence to:

- Search funders.
- Review funder profiles.
- Inspect related grants.
- Understand jurisdiction and source metadata.
- Use CRA/T3010 enrichment where available.
- Analyze giving patterns and funder likelihood.

Funder intelligence helps answer:

- Does this funder support organizations like ours?
- What kinds of programs do they run?
- What is their jurisdictional focus?
- Are there recurring or renewable opportunities?
- Is there evidence of historical giving behavior?

## Fit Rules

Open fit rules at:

```text
/fit-rules
```

Fit rules allow the organization to define how opportunities should be screened.

They include:

- Legal eligibility filters.
- Jurisdiction requirements.
- Sector and strategic fit requirements.
- Amount and cost-share checks.
- Deadline/runway expectations.
- Weighting between deterministic rules and LLM evaluation.
- Auto-archive behavior for failed opportunities.
- Manual review options for ambiguous cases.

Use fit rules carefully. They determine whether the system recommends,
deprioritizes, or archives opportunities.

Recommended practice:

- Start conservative.
- Review archived grants periodically.
- Adjust rules when good opportunities are being filtered out.
- Keep a clear reason for each rule change.

## Proposal Workspace

Open proposals at:

```text
/proposals
```

The proposal module manages active applications after a grant is worth pursuing.

Use it to:

- View all proposals.
- Open a proposal editor.
- Draft proposal sections.
- Attach and manage documents.
- Track section status.
- Maintain citations.
- Prepare export-ready content.
- Move work toward submission.

### Proposal Detail

Open a proposal at:

```text
/proposals/:id
```

The proposal detail page is used to work section by section. Depending on the
proposal state, it may include:

- Proposal metadata.
- Draft sections.
- Section-level editing.
- Document manager.
- Citation tracking.
- NotebookLM bridge.
- Quality gates.
- Submission dialog.

### Document Management

Documents can be attached to support an application. Typical examples include:

- Organization profile.
- Budget.
- Letters of support.
- Logic model.
- Financial documents.
- Previous reports.
- Funder-specific forms.

Documents should be kept current and named clearly.

## Proposal Quality and Revision

Open quality at:

```text
/quality
```

Open proposal revision at:

```text
/proposals/:proposalId/revision
```

Quality tools help determine whether a proposal is ready to submit.

They may include:

- Proposal quality scores.
- Trends across proposals.
- Reviewer-style findings.
- Severity grouping.
- Missing section detection.
- Citation and evidence checks.
- Readiness checks before submission.

Use quality review before submitting any proposal. A high fit grant can still
fail if the application is incomplete, unsupported, or unclear.

## Submissions

Open submissions at:

```text
/submissions
```

The submissions module tracks proposals that have been sent to funders.

Use it to:

- Track submitted applications.
- Review submission status.
- Maintain submission dates.
- Monitor outcomes.
- Keep a record of funder response.

Recommended practice:

- Record submission immediately after sending.
- Attach confirmation receipts where available.
- Update outcomes as soon as funders respond.

## Post-Award Management

Post-award tools help manage grants after submission and award decisions.

### Post-Award Dashboard

Open:

```text
/post-award
```

Use it to:

- Review outcomes.
- Track win rate.
- Monitor reporting deadlines.
- See awarded and closed opportunities.

### Financial Tracking

Open:

```text
/financial
```

Use it to:

- Track budget versus actuals.
- Compare funding year over year.
- Monitor utilization.
- Understand financial performance across grants.

### Impact Measurement

Open:

```text
/impact
```

Use it to:

- Track outcomes.
- Review impact details.
- Connect funded work to measurable results.
- Prepare reporting narratives.

### Renewal Intelligence

Open:

```text
/renewal
```

Use it to:

- Estimate renewal likelihood.
- Identify recurring opportunities.
- Prepare proactive renewal plans.
- Avoid missing repeat funding cycles.

## Competitive Intelligence

Open competitive intelligence at:

```text
/competitive
```

Competitive intelligence helps the team understand the public funding market.

It includes:

- Competitive dashboard.
- Recipient profiling.
- Program analysis.
- Government grant data exploration.
- Signals about who receives funding and through which programs.

Additional pages:

| Page       | URL                       | Purpose                               |
| ---------- | ------------------------- | ------------------------------------- |
| Recipients | `/competitive/recipients` | Search and profile funding recipients |
| Programs   | `/competitive/programs`   | Analyze programs and funding patterns |

Use competitive intelligence to answer:

- Who else is winning similar funding?
- Which programs are most active?
- What funder patterns are visible?
- Where does the organization appear competitive?

## Operations and Collaboration

### Tasks

Open:

```text
/tasks
```

Use tasks to coordinate team responsibilities:

- Assign work.
- Set priority.
- Track status.
- Leave comments.
- Keep proposal and compliance work moving.

### Compliance Calendar

Open:

```text
/compliance-calendar
```

Use the compliance calendar to:

- Track deadlines.
- Monitor reporting obligations.
- See upcoming compliance items.
- Reduce missed-date risk.

Recommended practice:

- Review weekly.
- Assign owners to each deadline.
- Add reminders for reporting requirements.

## Organization Profile

Open:

```text
/org
```

The organization profile is central to fit evaluation. It should be accurate
before trusting recommendations.

Key profile fields may include:

- Organization name.
- Sectors.
- Jurisdictions.
- Stage.
- Annual budget.
- Focus areas.

The fit engine uses the profile to evaluate whether a grant matches the
organization's real eligibility and strategy.

## Compliance and Privacy

Open:

```text
/compliance
/privacy
```

These pages document the platform's governance posture.

The project is designed around:

- Local-first data handling.
- Auditability.
- Evidence-backed decisions.
- Canadian grant workflows.
- Privacy-conscious operation.
- Reduced dependence on external AI services.

Users should still apply normal organizational data policies when uploading
documents or entering sensitive information.

## Administration

Admin pages are for users who manage the platform, sources, agents, users, and
operational health.

Open:

```text
/admin
```

### Admin Areas

| Page            | URL                  | Purpose                                              |
| --------------- | -------------------- | ---------------------------------------------------- |
| Admin dashboard | `/admin`             | Administrative overview                              |
| Agents          | `/admin/agents`      | Configure local AI agents and model behavior         |
| Candidates      | `/admin/candidates`  | Review funder candidates                             |
| History         | `/admin/history`     | Review admin history                                 |
| Modules         | `/admin/modules`     | Manage platform modules                              |
| Sources         | `/admin/sources`     | Configure discovery sources                          |
| Users           | `/admin/users`       | Manage users and roles                               |
| Monitoring      | `/admin/monitoring`  | Review rate limits, cache, jobs, and platform health |
| Audit trail     | `/admin/audit-trail` | Inspect change history                               |
| Workflows       | `/admin/workflows`   | Configure approval chains                            |

Admin users should make changes carefully because source configuration, fit
rules, and agent settings can affect discovery and scoring results.

## Autonomous Improvement System

Open:

```text
/autonomy
```

The autonomy dashboard surfaces the local self-improvement system.

The daemon fleet includes:

| Daemon         | Purpose                                         |
| -------------- | ----------------------------------------------- |
| Audit          | Detects anomalies in data and process           |
| Self-eval      | Measures product quality metrics                |
| Improvement    | Proposes improvements based on observed gaps    |
| Self-criticism | Reviews the system adversarially for weaknesses |
| Watchdog       | Supervises and repairs daemon health            |

Use the autonomy page to:

- Monitor daemon health.
- Review recent self-evaluation metrics.
- See self-criticism findings.
- Inspect improvement backlog.
- Confirm whether the autonomous system is operating normally.

Important: the autonomy system can identify and recommend improvements, but
human review remains important for product decisions, source quality, and
changes that affect real grant outcomes.

## Evidence, Auditability, and Trust

IIAL Grants is designed to make AI-assisted work auditable.

Trust signals include:

- Source URLs.
- Evidence spans.
- Fetch trails.
- Agent traces.
- Evaluation rationale.
- Axis breakdowns.
- Audit trail.
- Change history.
- Requirements with criticality.

When reviewing an AI-generated recommendation, always check:

1. The official source.
2. The extracted fields.
3. The evidence snippets.
4. The fit rationale.
5. The requirements list.
6. Any warnings or partial-review notes.

The system should help users decide faster, but it should not replace final
professional judgment.

## Recommended Operating Rhythm

### Daily

- Open the dashboard.
- Review urgent deadlines.
- Check new grants.
- Fetch details for promising leads.
- Evaluate enriched opportunities.
- Update proposal tasks.

### Weekly

- Review fit rules.
- Review the compliance calendar.
- Review proposal quality findings.
- Check autonomy findings.
- Review archived or low-fit opportunities for false negatives.

### Monthly

- Review funder intelligence.
- Review competitive intelligence.
- Update organization profile if strategy changes.
- Review win/loss outcomes.
- Review post-award reporting obligations.
- Clean up stale proposals and old tasks.

## Troubleshooting

### The App Does Not Open

Try:

```bash
bun run dev
```

Then open:

```text
http://localhost:8080/grants
```

### A Grant Has Missing Amount or Deadline

Some funders do not publish these fields clearly. Use the official page and
evidence trail. If the field is truly unavailable, leave it unknown rather than
creating a false value.

### A Grant Shows Partial Review

`partial_enrichment_review` means the system found useful data but not all
critical fields. Review the official source before making a proposal decision.

### Fit Score Looks Wrong

Check:

- Organization profile.
- Fit rules.
- Grant eligibility.
- Deadline/runway.
- Amount and cost-share assumptions.
- Evaluation rationale.
- Evidence panel.

Then re-run evaluation if the underlying data changed.

### Local Model Is Missing

If an agent model is not installed in Ollama, the system should fall back to the
configured local fallback model when available. Admins can review model
configuration in:

```text
/admin/agents
```

### A Daemon Is Not Healthy

Open:

```text
/autonomy
```

Then review:

- Daemon health.
- Latest logs.
- Watchdog activity.
- Operations documentation in `docs/OPERATIONS-24-7.md`.

### A Proposal Cannot Be Submitted

Check proposal readiness:

- Are required sections drafted?
- Are critical requirements addressed?
- Are citations present where needed?
- Has quality review passed?
- Are required documents attached?

## Glossary

| Term               | Meaning                                                         |
| ------------------ | --------------------------------------------------------------- |
| Agent              | A local AI worker specialized for a specific task               |
| Audit trail        | Record of changes and important actions                         |
| Enrichment         | Fetching and structuring grant details from official sources    |
| Evidence span      | Source-backed snippet supporting an extracted fact or decision  |
| Fit score          | 0-1 score representing organizational fit                       |
| Funder             | Organization that offers or administers funding                 |
| Grant              | Funding opportunity tracked by the platform                     |
| Partial enrichment | Useful data exists, but one or more critical fields are missing |
| Proposal           | Application package being drafted or submitted                  |
| RLS                | Row Level Security in Supabase/PostgreSQL                       |
| Scored             | A grant has a fit evaluation                                    |
| Source             | Website, feed, or dataset used for discovery/enrichment         |
| Watchdog           | Local daemon that supervises other daemons                      |
