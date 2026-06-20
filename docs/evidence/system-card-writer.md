# System Card — Writer Agent

## EN

**Purpose.** Draft proposal sections (EN + FR-CA) grounded in retrieved
knowledge chunks.
**Model.** Gemini 2.5 Flash; embeddings `text-embedding-3-small` (1536).
**Inputs.** Section spec, hybrid-RAG context (BM25 ∪ vector, fused with RRF).
**Outputs.** `proposal_sections.content_en` + `content_fr` with
`[d1]..[dN]` citation markers tied to `proposal_citations`.
**Citation safety (ADR-005).** Drafts whose markers do not all map to
retrieved chunks are rejected by `validateCitations()` and never submitted.
**Human oversight.** Author reviews and edits every section before
`Submit`. The system never auto-submits to an external authority.
**Quality gates.** Gate 1 (4 unit tests on the validator), Gate 4
(pairwise prompt A/B), Gate 5 (adversarial injection).
**Limitations.** The Writer can mis-paraphrase; the Critic is the
second line of defence; the author is the third.

## FR-CA

**Objet.** Rédiger des sections de propositions (EN + FR-CA) ancrées dans
les fragments de connaissance récupérés.
**Modèle.** Gemini 2.5 Flash; plongements `text-embedding-3-small` (1536).
**Entrées.** Spécification de section, contexte RAG hybride (BM25 ∪ vectoriel,
fusion RRF).
**Sorties.** `proposal_sections.content_en` + `content_fr` avec marqueurs
de citation `[d1]..[dN]` liés à `proposal_citations`.
**Sûreté des citations (ADR-005).** Les brouillons dont les marqueurs ne
correspondent pas tous à des fragments récupérés sont rejetés par
`validateCitations()` et ne sont jamais soumis.
**Supervision humaine.** L'auteur révise et modifie chaque section avant
`Soumettre`. Le système ne soumet jamais automatiquement à une autorité
externe.
**Portes qualité.** Porte 1 (4 tests unitaires du validateur), Porte 4
(A/B par paires), Porte 5 (injection adverse).
**Limites.** Le Rédacteur peut paraphraser incorrectement; le Critique est
la deuxième ligne de défense; l'auteur, la troisième.
