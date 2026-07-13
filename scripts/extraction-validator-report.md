# Extraction Validator Report

_Generated: 2026-07-13T01:21:54.565Z_

## Pattern Matching Tests

### Capital of Development

Text: "Funding for the realization of projects in Europe"

✗ Amount: no pattern matched
✗ Deadline: no pattern matched

### Grant with explicit amount

Text: "This grant provides up to $500,000 CAD for eligible organizations"

✓ Amount matched: **500,000** (pattern: \$?([\d,]+(?:\.\d+)?)\s*(?:million|M|billion|B)?)
✗ Deadline: no pattern matched

### Grant with deadline

Text: "Apply now! Deadline: January 15, 2027. Funding: up to $250,000"

✓ Amount matched: **15,** (pattern: \$?([\d,]+(?:\.\d+)?)\s*(?:million|M|billion|B)?)
✓ Deadline matched: **January 15, 2027** (pattern: deadline[:\s]+([a-zA-Z]+ \d{1,2},? \d{4}))

## Recommendations


1. **Amount extraction improvements**:
   - Add pattern for currency symbols: $, CAD, CAD$
   - Add pattern for million/billion/K suffixes
   - Handle ranges: "from $X to $Y"
   - Handle text like "minimum $50K, maximum $500K"

2. **Deadline extraction improvements**:
   - Add pattern for full date formats: YYYY-MM-DD, MM/DD/YYYY, etc.
   - Handle relative dates: "30 days from now", "end of quarter"
   - Handle text: "applications close on", "final submission", "last day"

3. **Validation after extraction**:
   - Validate amount is numeric and > 0
   - Validate deadline is a valid future date
   - Validate format consistency (normalize to ISO format)

4. **Implementation location**:
   - File: src/lib/grant-extraction.ts
   - Functions: parseAmount(), parseDeadline()
   - Add unit tests for each pattern


---
Next: Apply these improvements to grant-extraction.ts
