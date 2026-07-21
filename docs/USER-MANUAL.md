# IIAL Grants User Manual

Professional user guide for the IIAL Grants platform.

Last updated: 2026-07-21

## Table of Contents

1. [Purpose of the System](#purpose-of-the-system)
2. [How to Open the Platform](#how-to-open-the-platform)
3. [Core Concepts](#core-concepts)
4. [Main Navigation](#main-navigation)
5. [System Modules at a Glance](#system-modules-at-a-glance)
6. [End-to-End Grant Workflow](#end-to-end-grant-workflow)
7. [Dashboard](#dashboard)
8. [Grant Intelligence](#grant-intelligence)
9. [Grant Detail Page](#grant-detail-page)
10. [Funder Intelligence](#funder-intelligence)
11. [Fit Rules](#fit-rules)
12. [Proposal Workspace](#proposal-workspace)
13. [Proposal Quality and Revision](#proposal-quality-and-revision)
14. [Submissions](#submissions)
15. [Post-Award Management](#post-award-management)
16. [Competitive Intelligence](#competitive-intelligence)
17. [Operations and Collaboration](#operations-and-collaboration)
18. [Organization Profile](#organization-profile)
19. [Compliance and Privacy](#compliance-and-privacy)
20. [Administration](#administration)
21. [Autonomous Improvement System](#autonomous-improvement-system)
22. [Evidence, Auditability, and Trust](#evidence-auditability-and-trust)
23. [Recommended Operating Rhythm](#recommended-operating-rhythm)
24. [Troubleshooting](#troubleshooting)
25. [Glossary](#glossary)

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

## System Modules at a Glance

IIAL Grants is not only a grant search screen. It is an operating system for
the full grant lifecycle: finding opportunities, qualifying them, producing
proposal work, tracking submissions, and managing awarded grants.

### Opportunity Discovery and Qualification

| Module       | Page                | What it does                                                                                 | Main user action                                        |
| ------------ | ------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Grant radar  | `/grants`           | Central catalog of active opportunities, search, filters, lifecycle stages, and next actions | Find, compare, enrich, score, shortlist, or open grants |
| Grant detail | `/grants/:id`       | One-opportunity decision page with evidence, requirements, fit, source URLs, and audit link  | Decide whether to pursue a grant                        |
| Grant audit  | `/grants/:id/audit` | Shows how rules, evidence, and agent traces support the decision                             | Verify why the system made a recommendation             |
| Funder atlas | `/funders`          | Search and inspect funders, source metadata, CRA/T3010 enrichment, and related grants        | Understand who funds what                               |
| Fit rules    | `/fit-rules`        | Configure eligibility, deadline, strategic fit, amount, and scoring behavior                 | Tune the screening model                                |

### Proposal and Submission Pipeline

| Module          | Page                      | What it does                                                         | Main user action                           |
| --------------- | ------------------------- | -------------------------------------------------------------------- | ------------------------------------------ |
| Proposal studio | `/proposals`              | Lists active proposals and application work                          | Open or manage proposal drafts             |
| Proposal detail | `/proposals/:id`          | Section-level drafting, documents, citations, readiness, and exports | Build the application package              |
| Revision agent  | `/proposals/:id/revision` | Groups proposal weaknesses by severity and suggests fixes            | Improve proposal quality before submission |
| Quality board   | `/quality`                | Portfolio-level proposal quality metrics and trends                  | Spot weak proposals and systemic issues    |
| Submissions     | `/submissions`            | Tracks sent applications, status, response, and outcome              | Keep the submission record current         |

### Post-Award and Portfolio Management

| Module     | Page          | What it does                                                           | Main user action                 |
| ---------- | ------------- | ---------------------------------------------------------------------- | -------------------------------- |
| Award desk | `/post-award` | Outcomes, reporting deadlines, awarded grants, and win/loss state      | Manage grants after the decision |
| Financials | `/financial`  | Budget, utilization, year-over-year funding, and financial performance | Monitor awarded funding          |
| Impact     | `/impact`     | Outcomes, indicators, and evidence of program impact                   | Track what the grant achieved    |
| Renewal    | `/renewal`    | Renewal likelihood and next-cycle intelligence                         | Prepare for recurring funding    |

### Operations, Intelligence, and Administration

| Module               | Page                      | What it does                                                                  | Main user action                            |
| -------------------- | ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- |
| Tasks                | `/tasks`                  | Team assignments, priorities, and follow-up work                              | Coordinate grant work                       |
| Compliance calendar  | `/compliance-calendar`    | Deadline tracking, reminders, and compliance items                            | Avoid missed reporting or application dates |
| Market intel         | `/competitive`            | Public grant market, recipient, and program analysis                          | Understand competition and funding patterns |
| Organization profile | `/org`                    | Stores organization attributes used by fit scoring                            | Keep eligibility context accurate           |
| Governance/privacy   | `/compliance`, `/privacy` | Local-first compliance posture and privacy information                        | Review assurance posture                    |
| Operations           | `/ops`                    | Platform health and operational checks                                        | Monitor system condition                    |
| Admin console        | `/admin/*`                | Users, modules, agents, sources, candidates, history, monitoring, workflows   | Configure and govern the system             |
| Autonomy             | `/autonomy`               | Local daemon health, self-evaluation, improvement backlog, and repair signals | Monitor continuous improvement              |

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

### Detailed Grant Search Process

The goal of grant search is not only to find a keyword match. The goal is to
move from many possible opportunities to a short list of grants that are
official, current, eligible, strategically relevant, and worth the proposal
effort.

The complete process has two connected parts:

- **Search and discovery**: finding candidate opportunities and turning them
  into structured grant records.
- **Rule validation**: checking whether each record passes IIAL's deterministic
  screening rules before the team spends proposal time.

```grantflow
search-rules-v1
```

Use this process every time.

#### 1. Prepare the search context

Before searching, confirm that the organization profile and fit rules are
current.

Check:

- Organization type, legal status, and jurisdiction.
- Core sectors and program areas.
- Typical project size and minimum worthwhile grant amount.
- Deadline runway: how many weeks are needed to prepare a good application.
- Cost-share or matching-fund tolerance.
- Any funders, sectors, or jurisdictions that should be excluded.

If these inputs are wrong, the system may still find grants, but the fit
recommendations will be less useful.

#### 2. Open the grant radar

Go to:

```text
/grants
```

From the dashboard, use the grant radar/open radar action. The grant catalog is
the main place to search, filter, compare, and open opportunities.

#### 3. Start with a broad search

Use the search box to enter a simple keyword, funder name, program name, or
sector.

Examples:

- `IRAP`
- `training`
- `innovation`
- `youth employment`
- `digital skills`
- `Canada`
- `Ontario`
- `NRC`

Good first searches are broad. Narrow too early and strong opportunities may be
missed because funders use different wording than expected.

#### 4. Review the visible records

For each visible grant, scan:

- Title and funder.
- Status or lifecycle stage.
- Deadline, if known.
- Amount range, if known.
- Eligibility signal.
- Fit score or fit verdict.
- Data quality indicators.
- Whether the record is active, expired, archived, or incomplete.

If a result looks promising but incomplete, do not reject it immediately. Open
the grant and fetch details.

#### 5. Apply filters

After the first scan, narrow the list.

Typical filter sequence:

1. Jurisdiction: keep grants relevant to the organization.
2. Eligibility: show likely eligible or reviewable records.
3. Deadline: focus on open opportunities with enough runway.
4. Funder: isolate a specific funder when researching known programs.
5. Status: separate new leads from enriched/scored opportunities.
6. Sort: prioritize by urgency, fit, or value.

Use filters as decision aids, not as permanent truth. If a grant has partial
data, it may disappear under strict filters until enrichment fills missing
fields.

#### 6. Use lifecycle stages

The grant workspace separates records by where they are in the process:

- Queue/new leads: items that need review.
- Lifecycle/pipeline: items moving through qualification and pursuit.
- Enriched/scored: items with structured facts or evaluation.
- Shortlisted/in proposal: items that deserve active work.
- Submitted/awarded/closed: items that have moved beyond search.

Start with new or active records when searching for fresh opportunities. Use
closed records for learning, history, or funder research.

#### 7. Open the grant detail page

Click the grant title to open the detail page.

On the detail page, confirm:

- The source is official or credible.
- The official page link opens.
- The title and funder match the source.
- Deadline and amount are present or explicitly unknown.
- Eligibility is specific enough to evaluate.
- Application requirements are visible.
- Evidence supports the extracted facts.

If the record is incomplete, use the available fetch/enrich action to retrieve
more details from official sources.

#### 8. Fetch details when information is missing

Use fetch/enrichment when a grant has missing or weak data:

- No amount.
- No deadline.
- Vague eligibility.
- Missing application requirements.
- Missing source trail.
- Partial enrichment review.

The system should preserve uncertainty. If the funder does not publish a
deadline, the system should say it is unknown instead of inventing one.

#### 9. Evaluate fit

Once enough facts are available, run or review the fit evaluation.

The fit result combines:

- Deterministic rules: eligibility, money math, strategic fit, deadline runway.
- Local LLM reasoning: explanation and qualitative assessment.
- Evidence: source-backed support for extracted facts and recommendations.

Read the score together with the rationale. A high score is not a command to
apply. A low score is not always a rejection if the data is incomplete or the
grant is strategically important.

#### 9A. Validate deterministic screening rules

The rules engine is the first serious decision checkpoint. It exists to prevent
the system from recommending grants that sound attractive but are legally,
financially, strategically, or operationally weak.

The current rule model focuses on these IIAL screening gates:

| Rule                  | Question answered                                               | Typical source fields                                                     | Result types          |
| --------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------- |
| F1 Legal eligibility  | Can this organization legally apply?                            | applicant types, charity/nonprofit language, geography, partner rules     | pass, review, fail    |
| F3 Money math         | Is the funding amount and cost-share practical?                 | min/max amount, matching funds, reimbursement rules, in-kind restrictions | pass, review, fail    |
| F4 Strategic fit      | Does the program match IIAL capabilities and target sectors?    | sectors, eligible activities, program objectives, organization profile    | strong, medium, weak  |
| F5 Deadline runway    | Is there enough time to prepare a credible application?         | deadline, intake status, today, internal runway thresholds                | safe, tight, too late |
| Evidence completeness | Are the decision fields backed by official or credible sources? | source URL, evidence spans, scrape/fetch trail, partial review notes      | complete, partial     |

For each rule, the system tries to avoid false certainty. If the source does
not clearly answer a question, the result should be **review**, not an invented
pass.

#### 9B. How F1 legal eligibility is checked

F1 asks whether IIAL, or the organization using the system, is allowed to apply.

The system reviews:

- Applicant type: nonprofit, charity, municipality, business, academic
  institution, Indigenous organization, consortium, or individual.
- Geography: federal, provincial, local, or funder-specific location limits.
- Direct applicant rules: whether the organization can apply directly or needs
  a partner.
- Exclusions: for-profit-only, individuals-only, province-only, sector-only, or
  invitation-only restrictions.
- Evidence wording: exact funder language that supports eligibility.

Recommended interpretation:

| F1 result | Meaning                                                      | User action                                      |
| --------- | ------------------------------------------------------------ | ------------------------------------------------ |
| Pass      | The source clearly allows this applicant type or profile     | Continue to money, strategic fit, and deadline   |
| Review    | Eligibility is ambiguous, partial, or depends on partnership | Create a task to verify before proposal drafting |
| Fail      | The source clearly excludes this applicant type or region    | Archive or keep only for reference               |

#### 9C. How F3 money math is checked

F3 checks whether the opportunity is financially worth pursuing.

The system reviews:

- Maximum award amount.
- Minimum award amount, if published.
- Whether the grant pays cash, reimbursement, tax credit, wage subsidy, or
  contribution funding.
- Matching funds or cost-share percentage.
- Whether in-kind contributions are accepted.
- Whether the funding amount is large enough for the expected proposal effort.
- Whether the organization can realistically carry cash-flow or reimbursement
  timing.

Recommended interpretation:

| F3 result | Meaning                                                             | User action                                 |
| --------- | ------------------------------------------------------------------- | ------------------------------------------- |
| Pass      | Amount and cost-share are viable                                    | Continue qualification                      |
| Review    | Amount is unknown, cost-share is unclear, or cash-flow risk exists  | Verify with funder or finance lead          |
| Fail      | Funding is too small, cost-share too high, or structure impractical | Deprioritize unless strategic value is high |

#### 9D. How F4 strategic fit is checked

F4 checks whether the grant aligns with what the organization actually does and
can credibly deliver.

The system compares grant language against:

- Organization mission and profile.
- Target sectors.
- Program capabilities.
- Eligible activities.
- Past or planned projects.
- Required outcomes and reporting burden.
- Funder priorities and keywords.

Recommended interpretation:

| F4 result | Meaning                                                 | User action                                 |
| --------- | ------------------------------------------------------- | ------------------------------------------- |
| Strong    | Grant purpose closely matches organization strengths    | Shortlist if F1, F3, and F5 also pass       |
| Medium    | Some alignment exists but the proposal angle needs work | Assign strategist/reviewer before drafting  |
| Weak      | The grant is outside the organization's real strengths  | Archive or use only for market intelligence |

#### 9E. How F5 deadline runway is checked

F5 protects the team from chasing grants that are too late to prepare well.

The system reviews:

- Published deadline.
- Rolling or intake-based status.
- Today's date.
- Internal minimum runway.
- Proposal complexity.
- Whether supporting documents, partners, budgets, or board approvals are
  needed.

Recommended interpretation:

| F5 result | Meaning                                            | User action                                         |
| --------- | -------------------------------------------------- | --------------------------------------------------- |
| Safe      | Enough time exists for a credible application      | Continue or shortlist                               |
| Tight     | Possible, but only if the team can act immediately | Assign tasks and confirm capacity                   |
| Too late  | Deadline passed or runway is below threshold       | Archive unless it is recurring and worth monitoring |
| Unknown   | No clear deadline published                        | Verify manually before treating as urgent           |

#### 9F. How the final fit score is formed

The final score combines deterministic rules with local LLM evaluation:

```text
combined_score = (weight_llm × llm_score) + ((1 - weight_llm) × rule_score)
```

The deterministic rule score keeps the system grounded. The LLM score adds
qualitative judgment, but it should not override hard blockers such as legal
ineligibility or a passed deadline.

Decision logic:

| Situation                                  | Recommended decision                                  |
| ------------------------------------------ | ----------------------------------------------------- |
| F1 fail                                    | Do not pursue unless a partner path exists            |
| F5 too late                                | Archive or monitor for next intake                    |
| F3 fail                                    | Deprioritize unless strategic value justifies effort  |
| F4 weak                                    | Usually archive; keep for market intelligence         |
| Any rule review/unknown                    | Create a verification task before proposal drafting   |
| All major rules pass and fit score is high | Shortlist and consider drafting                       |
| Rules pass but fit score is medium         | Review proposal angle before committing team capacity |

#### 9G. Where to verify the rule decision

Use the grant detail and audit pages together:

- On `/grants/:id`, read the fit card, requirements, eligibility evidence,
  official sources, and data quality panel.
- On `/grants/:id/audit`, review rules evaluated, evidence used, and agent
  trace.
- If the audit trail does not support a recommendation, treat the grant as
  unresolved and assign manual verification.

The rule validation process is complete only when the team can answer:

1. Are we allowed to apply?
2. Is the money worth it?
3. Does this match our strategy?
4. Do we have enough time?
5. Is the decision backed by source evidence?

#### 10. Decide the next action

Choose one of these outcomes:

| Outcome              | When to use it                                                         |
| -------------------- | ---------------------------------------------------------------------- |
| Fetch details        | The grant looks promising but lacks facts                              |
| Evaluate fit         | Facts are available but the decision signal is missing                 |
| Shortlist            | The grant is eligible, valuable, and strategically relevant            |
| Draft proposal       | The team has decided to pursue the opportunity                         |
| Assign task          | Someone must verify, call the funder, gather documents, or review fit  |
| Archive/deprioritize | The grant is expired, ineligible, too small, too late, or off-strategy |

#### 11. Document uncertainty

If a decision depends on missing information, create a task or note before
moving forward.

Examples:

- "Confirm whether nonprofits are eligible."
- "Check if matching funds are cash-only or in-kind."
- "Verify deadline; page lists program but no intake date."
- "Call funder about applicant geography."
- "Confirm whether IIAL can apply directly or needs a partner."

#### 12. Repeat and compare

Good grant search is iterative. After reviewing one result, return to `/grants`
and compare against other opportunities. The best grant is not always the first
grant found; it is the one with the best combination of eligibility, timing,
amount, strategic fit, evidence quality, and proposal feasibility.

### What Counts as a Good Search Result

A high-quality opportunity usually has:

- An official source URL.
- Clear funder identity.
- Current or recurring program status.
- Deadline or intake timing.
- Amount or funding range.
- Applicant eligibility.
- Eligible activities or sectors.
- Application requirements.
- Evidence trail.
- Fit rationale.
- A practical next action.

If several of these are missing, treat the record as a lead, not as a ready
opportunity.

### What to Do When Search Finds Nothing

If a search returns no useful grants:

1. Remove filters and search again.
2. Use broader keywords.
3. Search by funder instead of program name.
4. Try related terms. For example, search `training`, `skills`, `workforce`,
   and `employment` separately.
5. Check closed or archived records for historical funder patterns.
6. Ask an admin to review discovery sources under `/admin/sources`.
7. Add or refresh sources if the source list is stale.
8. Use funder intelligence to look for related programs.

No results does not always mean no funding exists. It may mean the source has
not been crawled, the funder uses different wording, or the opportunity is
recurring but not currently open.

### Manual Search vs. System Discovery

There are two ways opportunities enter the system:

- Manual/user-led search: the user searches existing records in `/grants`.
- Admin/system discovery: configured sources are crawled or refreshed, creating
  new grant leads.

Manual search is best when the team already knows a funder, keyword, or program
area. System discovery is best for expanding the catalog and finding new leads
from source lists.

### Search Quality Checklist

Before acting on a grant, confirm:

- [ ] The grant came from an official or credible source.
- [ ] The deadline is known or explicitly marked unknown.
- [ ] Eligibility has been reviewed.
- [ ] Amount and cost-share are acceptable.
- [ ] Requirements are realistic for the team.
- [ ] Fit score and rationale have been read.
- [ ] Evidence supports the key fields.
- [ ] The next action is clear.

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
