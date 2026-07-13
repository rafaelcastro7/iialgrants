# Data Quality Analysis

_Generated: 2026-07-13T01:14:21.815Z_

## Coverage Analysis (16 grants)

| Field | ✓ Present | ✗ Missing | Coverage |
|-------|-----------|-----------|----------|
| Summary | 16 | 0 | 100% |
| Amount (min) | 1 | 15 | 6% |
| Deadline | 2 | 14 | 13% |
| Eligibility | 16 | 0 | 100% |
| Sectors | 16 | 0 | 100% |

**Overall Completeness: 64%** (target: 85%)

## Top Missing Fields

### Grants missing DEADLINE (highest impact)

  - AI Assist Program
  - Business Strategy Internship (BSI)
  - Capital de Risque
  - Capital of Development
  - Collaborative Science, Technology and Innovation Program
  - Grants to International Affiliations (GIA) Program
  - Innovation Research Program (IRAP)
  - Investissement Québec
  - NRC IRAP International Collaboration
  - Personalized Assistance for Business Development

### Grants missing AMOUNT

  - AI Assist Program
  - Business Strategy Internship (BSI)
  - Capital de Risque
  - Capital of Development
  - Collaborative Science, Technology and Innovation Program
  - Grants to International Affiliations (GIA) Program
  - Innovation Research Program (IRAP)
  - Investissement Québec
  - NRC IRAP International Collaboration
  - NRC IRAP support for clean technology

## Validation Rules Needed

- **Amount validation**: Must be numeric, > 0, reasonable range (< $100M)
- **Deadline validation**: Must be future date, YYYY-MM-DD format
- **Eligibility validation**: Must be object with known keys (age, sector, location, etc)
- **Summary validation**: Min 20 chars, max 500 chars, no HTML tags

## Extraction Improvements

1. **Date parsing**: Handle 'January 15, 2027', '15-01-2027', 'End of Q3 2027', etc.
2. **Amount parsing**: Handle '$1.5M', '1,500,000 CAD', 'up to $2M', ranges, etc.
3. **Eligibility extraction**: Parse eligibility text into structured fields
4. **Sector inference**: If missing, infer from URL/title/summary keywords

---
Analysis complete.
