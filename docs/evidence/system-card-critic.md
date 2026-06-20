# System Card — Critic Agent

## EN

**Purpose.** Score a complete proposal 0–1 and emit per-section findings
(info / warn / block) in EN + FR-CA.
**Model.** Gemini 2.5 Pro (only agent on Pro; cascade discipline ADR-003).
**Inputs.** Full proposal sections + grant spec.
**Outputs.** `proposals.critic_score` + `proposal_sections.critic_notes`.
**Block findings** prevent the `Submit` button from being enabled in the UI.
**Human oversight.** The author can dispute a block by editing the section
and re-running the Critic. Disputes are visible in audit logs.
**Failure modes.** Over-confidence, false positives on bilingual nuance,
score drift between releases.
**Quality gates.** Gate 2 regression on a frozen set, Gate 4 pairwise
when prompt changes, weekly review of score distribution.
**Limitations.** Critic is not a substitute for legal or programmatic
review by the funder.

## FR-CA

**Objet.** Noter une proposition complète sur 0–1 et émettre des
constatations par section (info / avert. / bloc) en EN + FR-CA.
**Modèle.** Gemini 2.5 Pro (seul agent sur Pro; discipline de cascade ADR-003).
**Entrées.** Sections complètes de la proposition + spécification de
subvention.
**Sorties.** `proposals.critic_score` + `proposal_sections.critic_notes`.
**Les constatations « bloc »** empêchent l'activation du bouton `Soumettre`
dans l'interface.
**Supervision humaine.** L'auteur peut contester un bloc en modifiant la
section et en relançant le Critique. Les contestations sont visibles dans
les journaux d'audit.
**Modes de défaillance.** Excès de confiance, faux positifs sur les
nuances bilingues, dérive de score entre versions.
**Portes qualité.** Régression Porte 2, A/B Porte 4 lors d'un changement
de prompt, revue hebdomadaire de la distribution des scores.
**Limites.** Le Critique ne remplace pas une revue juridique ou
programmatique par le bailleur.
