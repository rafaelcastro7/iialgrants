#!/usr/bin/env node
// Extraction Validator — test and improve extraction logic for missing fields.
// This daemon will iterate on regex patterns and parsing logic to recover
// amount + deadline from grant descriptions/URLs.

import { readFileSync, writeFileSync } from "node:fs";

const OUT = "scripts/extraction-validator-report.md";

function log(text) {
  console.log(text);
  writeFileSync(OUT, text + "\n", { flag: "a" });
}

writeFileSync(OUT, "");

log("# Extraction Validator Report\n");
log(`_Generated: ${new Date().toISOString()}_\n`);

// Test extraction patterns
const patterns = {
  amount: [
    /\$?([\d,]+(?:\.\d+)?)\s*(?:million|M|billion|B)?/i,
    /([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{2})?)\s*CAD/i,
    /up to\s+\$?([\d,]+(?:\.\d+)?)/i,
    /from\s+\$?([\d,]+)\s*to\s+\$?([\d,]+)/i,
    /grant\s+(?:of|amount)?\s+\$?([\d,]+(?:\.\d+)?)/i,
  ],
  deadline: [
    /deadline[:\s]+([a-zA-Z]+ \d{1,2},? \d{4})/i,
    /deadline[:\s]+(\d{4}-\d{2}-\d{2})/i,
    /by\s+([a-zA-Z]+ \d{1,2},? \d{4})/i,
    /(?:close|closes|closing)[sd]?\s+(?:date)?[:\s]*([a-zA-Z]+ \d{1,2},? \d{4})/i,
    /deadline[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ],
};

const testCases = [
  {
    title: "Capital of Development",
    text: "Funding for the realization of projects in Europe",
    expectedAmount: null,
    expectedDeadline: null,
  },
  {
    title: "Grant with explicit amount",
    text: "This grant provides up to $500,000 CAD for eligible organizations",
    expectedAmount: "500000",
    expectedDeadline: null,
  },
  {
    title: "Grant with deadline",
    text: "Apply now! Deadline: January 15, 2027. Funding: up to $250,000",
    expectedAmount: "250000",
    expectedDeadline: "January 15, 2027",
  },
];

log("## Pattern Matching Tests\n");

for (const testCase of testCases) {
  log(`### ${testCase.title}\n`);
  log(`Text: "${testCase.text}"\n`);

  // Test amount patterns
  let amountFound = null;
  for (const pattern of patterns.amount) {
    const match = testCase.text.match(pattern);
    if (match) {
      amountFound = match[1];
      log(`✓ Amount matched: **${amountFound}** (pattern: ${pattern.source})`);
      break;
    }
  }
  if (!amountFound) {
    log(`✗ Amount: no pattern matched`);
  }

  // Test deadline patterns
  let deadlineFound = null;
  for (const pattern of patterns.deadline) {
    const match = testCase.text.match(pattern);
    if (match) {
      deadlineFound = match[1];
      log(`✓ Deadline matched: **${deadlineFound}** (pattern: ${pattern.source})`);
      break;
    }
  }
  if (!deadlineFound) {
    log(`✗ Deadline: no pattern matched`);
  }

  log("");
}

log("## Recommendations\n");

log(`
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
`);

log("\n---\nNext: Apply these improvements to grant-extraction.ts");
