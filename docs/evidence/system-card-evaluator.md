# System Card — Evaluator Agent

## EN

**Purpose.** Score grant-to-org fit on a 0–1 scale with rationale.
**Model.** Gemini 2.5 Flash.
**Inputs.** Grant metadata + org profile (sector, region, stage, amount band).
**Outputs.** `grant_evaluations` row with `fit_score`, `rationale_en`,
`rationale_fr`, dimensions (sector, jurisdiction, stage, amount).
**Human oversight.** Users can override the score and exclude grants;
overrides are tracked in `grant_events`.
**Failure modes.** Sector mis-classification, jurisdiction confusion
(federal vs provincial vs municipal), stage mismatch.
**Quality gates.** Gate 2 (golden regression, 20 cases), Gate 3
(LLM-as-judge), Gate 5 (adversarial: prompt-injection, sector, stage).
**Limitations.** Score is advisory only. It does not constitute an
eligibility determination.

## FR-CA

**Objet.** Évaluer l'adéquation subvention–organisation sur une échelle 0–1
avec justification.
**Modèle.** Gemini 2.5 Flash.
**Entrées.** Métadonnées de subvention + profil organisationnel (secteur,
région, stade, fourchette de montant).
**Sorties.** Ligne `grant_evaluations` avec `fit_score`, `rationale_en`,
`rationale_fr`, dimensions (secteur, juridiction, stade, montant).
**Supervision humaine.** L'utilisateur peut remplacer le score et exclure
des subventions; les remplacements sont consignés dans `grant_events`.
**Modes de défaillance.** Mauvaise classification sectorielle, confusion
de juridiction, désalignement de stade.
**Portes qualité.** Porte 2 (régression dorée, 20 cas), Porte 3 (juge LLM),
Porte 5 (adverse).
**Limites.** Le score est consultatif. Il ne constitue pas une décision
d'admissibilité.
