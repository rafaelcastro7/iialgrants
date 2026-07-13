# Improvement Plan — Data Completeness 64% → 85%

**Date**: 2026-07-13  
**Status**: In progress  
**Owner**: Autonomous daemon system + manual review

## Current State

- **Overall completeness**: 64% (measured)
- **Grants analyzed**: 16 scored/active
- **Biggest gaps**:
  - Amount (CAD): 6% coverage (15/16 missing)
  - Deadline: 13% coverage (14/16 missing)
  - Summary: 100% ✓
  - Eligibility: 100% ✓
  - Sectors: 100% ✓

## Root Causes (per self-criticism daemon)

1. **Validation Flaws**: No regex patterns for currency/amount variations
2. **Edge Cases Unhandled**: Date formats, relative dates not parsed
3. **Design Flaw**: All-or-nothing enrichment (missing one field = stuck)

## Target Improvements

### 1. Amount Extraction (6% → 90%)
**File**: `src/lib/grant-extraction.ts` → `parseAmount()`

**Patterns to add**:
```
- $500,000 CAD
- 500000 CAD
- $500K, $5M, $5.5B
- from $X to $Y range
- "up to $500,000"
- "minimum $50K, maximum $500K"
```

**Validation**:
- Must be numeric > 0
- Reasonable range: < $1B
- Normalize to CAD amount (number only)

**Test cases**:
```
"up to $500,000 CAD" → 500000
"from $50K to $250K" → 50000 (min) / 250000 (max)
"Funding: $1.5M" → 1500000
```

### 2. Deadline Extraction (13% → 90%)
**File**: `src/lib/grant-extraction.ts` → `parseDeadline()`

**Patterns to add**:
```
- "Deadline: January 15, 2027"
- "by 2027-01-15"
- "closes 15/01/2027"
- "applications open until March 31"
- "end of Q2 2027"
- "30 days from application date"
```

**Validation**:
- Must be valid future date
- Normalize to ISO format: YYYY-MM-DD
- Reject dates in the past

**Test cases**:
```
"Deadline: January 15, 2027" → 2027-01-15
"by 2027-12-31" → 2027-12-31
"closes on March 15, 2027" → 2027-03-15
```

### 3. Fallback Strategy
**File**: `src/server/grant-enrichment.ts`

**Current behavior**: All-or-nothing (missing field = stuck)  
**New behavior**: Partial enrichment allowed

```typescript
// If we have summary + eligibility but missing amount/deadline:
// Mark as "enriched_partial" with note about what's missing
// Allow it to be scored even if incomplete
```

## Implementation Order

1. ✓ **Analyzed** — data-quality-analyzer.mjs reveals exact gaps
2. ✓ **Validated patterns** — extraction-validator.mjs tests regex
3. **TODO** — Update parseAmount() in grant-extraction.ts
4. **TODO** — Update parseDeadline() in grant-extraction.ts
5. **TODO** — Add unit tests for both functions
6. **TODO** — Run rescue-stuck-grants.mjs again
7. **TODO** — Measure new scorecard (self-eval daemon)

## Expected Impact

- **Amount extraction**: 6% → 90% → +1.5% overall
- **Deadline extraction**: 13% → 90% → +1.5% overall
- **Subtotal**: 64% → 67%

**To reach 85%**: Combine with eligibility inference (infer from sector/title if missing) → +18%

## Daemon Support

- **Self-criticism daemon**: Identified validation flaws ✓
- **Self-eval daemon**: Will measure new scorecard
- **Improvement daemon**: Will propose next actions
- **Audit daemon**: Will detect remaining gaps
- **Watchdog**: Will supervise all activities

## Success Criteria

- [ ] Amount extraction tested on 10+ real grant URLs
- [ ] Deadline extraction handles 5+ date format variations
- [ ] New tests added to src/lib/grant-extraction.test.ts
- [ ] Scorecard measure after improvement: ≥85% completeness
- [ ] Zero regressions in existing extractions
