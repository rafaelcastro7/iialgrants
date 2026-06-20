# System Card — Discoverer Agent

## EN

**Purpose.** Discover new Canadian grant opportunities from RSS feeds and
public APIs (Open Government Portal, Grants Canada).
**Model.** Gemini 2.5 Flash via Lovable AI Gateway.
**Inputs.** Raw feed entries (title, summary, URL, source).
**Outputs.** Normalized `grants` rows in state `discovered` (no PII).
**Human oversight.** None at this stage — discoveries are not user-visible
until the Evaluator promotes them. Failures alert the on-call.
**Failure modes.** Source schema drift, rate limits, duplicate detection.
**Metrics.** `agent_runs` rows; alert on error rate > 5 % / 24 h.
**Limitations.** Only public sources; no scraping of paywalled databases.

## FR-CA

**Objet.** Découvrir de nouvelles occasions de subventions canadiennes à
partir de fils RSS et d'API publiques (Portail de gouvernement ouvert,
Subventions Canada).
**Modèle.** Gemini 2.5 Flash via Lovable AI Gateway.
**Entrées.** Entrées brutes (titre, résumé, URL, source).
**Sorties.** Lignes `grants` normalisées à l'état `discovered` (aucun RP).
**Supervision humaine.** Aucune à cette étape — les découvertes ne sont
visibles qu'après promotion par l'Évaluateur. Les échecs alertent l'astreinte.
**Modes de défaillance.** Changement de schéma source, limitation de débit,
détection des doublons.
**Mesures.** Lignes `agent_runs`; alerte si taux d'erreur > 5 % / 24 h.
**Limites.** Sources publiques uniquement; pas d'extraction de bases payantes.
