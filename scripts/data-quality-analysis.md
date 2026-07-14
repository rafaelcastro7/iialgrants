# Data Quality Analysis

_Generated: 2026-07-14T15:17:13.853Z_

## Coverage Analysis (10 grants)

| Field        | Present | Missing | Coverage |
| ------------ | ------- | ------- | -------- |
| Summary      | 10      | 0       | 100%     |
| Amount (min) | 1       | 9       | 10%      |
| Deadline     | 2       | 8       | 20%      |
| Eligibility  | 10      | 0       | 100%     |
| Sectors      | 10      | 0       | 100%     |

**Overall Completeness: 66%** (target: 85%)

## Pipeline Integrity

- Scored grants missing evaluation: 0
- Scored grants missing scored_at: 0
- Partial review notes: 10
- Legacy partial notes: 0

## Top Missing Fields

### Grants missing DEADLINE (highest impact)

- AI Assist Program
- Business Strategy Internship (BSI)
- Capital of Development
- Collaborative Science, Technology and Innovation Program
- Grants to International Affiliations (GIA) Program
- Personalized Assistance for Business Development
- PSCE Volet II - Support for Commercialization and Exportation
- Talent Acquisition Strategies

### Grants missing AMOUNT

- AI Assist Program
- Business Strategy Internship (BSI)
- Capital of Development
- Collaborative Science, Technology and Innovation Program
- Grants to International Affiliations (GIA) Program
- NRC IRAP support for clean technology
- Outreach Initiative of the NRC
- Personalized Assistance for Business Development
- Talent Acquisition Strategies

## Validation Rules Needed

- Amount validation: must be numeric, positive, and below a reasonable ceiling.
- Deadline validation: must be a future date or explicit rolling/no-deadline signal.
- Eligibility validation: must be a structured object with known applicant constraints.
- Summary validation: 20-500 chars, no HTML tags, grounded in source text.

## Extraction Improvements

1. Date parsing: handle English/French long dates, ranges, rolling calls, and fiscal periods.
2. Amount parsing: handle CAD formats, shorthand amounts, ranges, and maximum contribution caps.
3. Eligibility extraction: parse applicant type, location, sector, stage, and exclusions.
4. Sector inference: infer from URL/title/summary when funder pages omit structured sectors.

---

Analysis complete.
