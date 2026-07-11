// Shared copy for CRA T3010 open-data codes (data/cra-t3010/ident.csv:
// Category, Designation) rendered on the funders screens. Deliberately NOT a
// code->label decode table: CRA's own published category-code references
// only document a 2-digit scheme (01-09 Welfare, 10-19 Health, 20-29
// Education, 30-49 Religion, 50-59 Community Benefit, 63-85 Other, 99 Misc)
// that doesn't unambiguously cover every 4-digit value seen in this dataset
// (e.g. 0200, 0210), and the single-letter Designation codes (A/B/C —
// Charitable Organization / Public Foundation / Private Foundation) have no
// independently verifiable letter-to-label mapping in CRA's public
// documentation. Inventing a specific label per code risks presenting a
// wrong one as fact, which this project's data must never do — labeling the
// raw value as a CRA code (not a mystery number/letter) is the honest
// middle ground until a verified mapping is available.
export const CRA_CATEGORY_TOOLTIP =
  "CRA T3010 registered-charity category code — see the CRA's Registered Charity Information Return guide for the full code list.";

export const CRA_DESIGNATION_TOOLTIP =
  "CRA T3010 registered-charity designation code (Charitable Organization / Public Foundation / Private Foundation) — see the CRA's Registered Charity Information Return guide.";
