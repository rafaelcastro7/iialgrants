# Grant catalog search benchmark baseline — 2026-07-21

Command:

```bash
bun run eval:search
```

Corpus at measurement time: 23 active grants. Ranking implementation:
`search_grant_catalog`; K=10; 25 maintained queries.

| Metric            | Baseline |  Target |
| ----------------- | -------: | ------: |
| Precision@10      |    0.693 |   0.750 |
| Recall@10         |    0.732 |   0.900 |
| MRR               |    0.760 | monitor |
| nDCG@10           |    0.732 |   0.800 |
| Hard-fail leakage |        0 |       0 |

The current search is below the target on precision, recall and nDCG. This is
an honest baseline, not a passing certificate.

### Confirmed zero-recall gaps

- `hire young graduates` → Youth Employment Program
- French `vieillissement en santé communauté` → Healthy Aging opportunity
- `Germany science internship RISE` → RISE Globalink
- `Quebec AI tax credit` → Governmental Financing Programs
- French `crédit d'impôt intelligence artificielle Québec` → same program

These failures show that lexical/fuzzy retrieval cannot bridge bilingual and
conceptual synonyms consistently. Phase 2 must improve them through controlled
taxonomy expansion plus local vector retrieval; adding arbitrary wildcard
rules to the RPC is not acceptable.

### Reproduction contract

1. Start local Supabase and apply migrations.
2. Load the maintained local grant corpus.
3. Set local `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Run `bun run eval:search`.
5. Review per-case metrics before changing weights.
6. Use `bun run eval:search -- --enforce` only when the target thresholds are
   expected to pass.

## Hybrid RRF checkpoint — 2026-07-21 20:27 America/Toronto

After canonical bilingual documents, local `nomic-embed-text` embeddings,
bounded taxonomy expansion, semantic pruning and lexical/semantic RRF fusion:

| Metric | Lexical baseline | Hybrid RRF v1 | Target | Result |
|---|---:|---:|---:|---|
| Precision@10 | 0.693 | **0.756** | >= 0.75 | pass |
| Recall@10 | 0.732 | **1.000** | >= 0.90 | pass |
| MRR | 0.760 | **0.944** | tracked | improved |
| nDCG@10 | 0.732 | **0.989** | >= 0.80 | pass |
| Hard-fail leakage | 0 | **0** | 0 | pass |

Command: `bun run eval:search --enforce` (exit 0).

The active benchmark contains 18 executable cases. Seven positive cases are
reported separately as `staleCaseIds` because every labeled relevant grant is
currently archived; they are not silently converted into negative cases or
counted as retrieval failures. They must be relabeled when equivalent active
opportunities enter the catalog. Browser proof for the previous zero-recall
French query `vieillissement en santé` returns only **Healthy Aging Community
Living Lab Funding Opportunity** at rank 1, with no route error.
