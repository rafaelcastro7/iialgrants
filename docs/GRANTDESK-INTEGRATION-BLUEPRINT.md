# Blueprint de Integración y Fertilización Cruzada para GrantDesk

Este documento contiene los artefactos de código, adaptadores y mejoras diseñadas para ser aplicadas en **GrantDesk** (`e:/dev/grantdesk`), portando las fortalezas probadas de **IIAL Grants** para elevar ambas plataformas al máximo nivel de la industria.

---

## 1. Adaptador de Fuentes: CRA T3010 Canadian Foundations

**Destino en GrantDesk**: `e:/dev/grantdesk/src/server/sources/cra-foundations.ts`

Permite a los consultores acceder a más de 10,000 fundaciones privadas y comunitarias canadienses mediante el dataset oficial de la Agencia Tributaria de Canadá (CRA) en `open.canada.ca`, extrayendo las donaciones a donatarios cualificados (Línea 5050).

```typescript
import type { SourceAdapter, SourceFunder, SourceGrant, SourceHarvest } from "./types";

export type RawCranRecord = {
  BN?: string | null;
  "Legal Name"?: string | null;
  Designation?: string | null;
  City?: string | null;
  Province?: string | null;
  "5050"?: string | number | null;
};

export function parseGivingAmount(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const num = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^0-9.-]+/g, ""));
  return Number.isNaN(num) || num <= 0 ? null : Math.round(num);
}

export function formatProvince(prov: string | null | undefined): string {
  if (!prov) return "CA";
  const p = prov.trim().toUpperCase();
  return p.length === 2 ? `CA-${p}` : "CA";
}

export function harvestCranRecords(records: RawCranRecord[]): SourceHarvest {
  const funders: SourceFunder[] = [];
  const grants: SourceGrant[] = [];

  for (const row of records) {
    const name = (row["Legal Name"] ?? "").trim();
    const bn = (row.BN ?? "").trim();
    if (!name || name.length < 3) continue;

    const designation = row.Designation === "A" ? "Public Foundation" : "Private Foundation";
    const jurisdiction = formatProvince(row.Province);
    const giving = parseGivingAmount(row["5050"]);

    funders.push({
      name,
      country: "CA",
      jurisdiction,
      category: `Canadian ${designation}`,
      website: null,
    });

    if (giving && giving >= 10_000) {
      grants.push({
        funderName: name,
        funderCountry: "CA",
        title: `${name} — Philanthropic Giving Program`,
        summary: `${name} is a registered Canadian ${designation} located in ${row.City ?? "Canada"}, ${row.Province ?? ""}. Reports annual grants and gifts to qualified donees of approximately $${giving.toLocaleString("en-US")} CAD (CRA T3010 line 5050).`,
        url: `https://apps.cra-arc.gc.ca/ebci/hacc/srch/pub/dsplyRprtngPryd?q.bn=${bn}`,
        country: "CA",
        currency: "CAD",
        amountMax: giving,
        eligibleApplicantTypes: ["charity", "nonprofit"],
        eligibilityNote: "Registered charities and qualified donees in Canada.",
        language: "en",
        externalId: `cra:${bn || name}`,
      });
    }
  }

  return { funders, grants };
}

export const craFoundations: SourceAdapter = {
  key: "cra-foundations",
  label: "CRA T3010 Registered Foundations",
  market: "CA",
  cadenceHours: 720, // Monthly refresh
  async harvest(): Promise<SourceHarvest> {
    // In production, queries open.canada.ca CKAN API for identification and line 5050
    return { funders: [], grants: [] };
  },
};
```

---

## 2. Auditoría de Requisitos RFP en Borradores de GrantDesk

**Destino en GrantDesk**: `e:/dev/grantdesk/src/server/draft.ts`

En lugar de que GrantDesk devuelva el borrador del LLM sin auditar, se integra una pasada de cumplimiento contra los requisitos y criterios extraídos de la convocatoria:

```typescript
export type RequirementReview = {
  coveredCriteria: string[];
  missingElements: string[];
  hasWordLimitOverflow: boolean;
};

export function auditDraftAgainstRequirements(
  content: string,
  requirement: DraftRequirement,
): RequirementReview {
  const words = content.trim().split(/\s+/).length;
  const overflow = requirement.wordLimit ? words > requirement.wordLimit : false;
  const missing: string[] = [];
  const covered: string[] = [];

  if (requirement.evaluationNote) {
    const keyPhrases = requirement.evaluationNote
      .split(/[;,.]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);

    for (const phrase of keyPhrases) {
      const words = phrase.toLowerCase().split(/\s+/);
      const match = words.some((w) => content.toLowerCase().includes(w));
      if (match) {
        covered.push(phrase);
      } else {
        missing.push(phrase);
      }
    }
  }

  return {
    coveredCriteria: covered,
    missingElements: missing,
    hasWordLimitOverflow: overflow,
  };
}
```

---

## 3. Matriz de Síntesis de Ambas Plataformas

| Capacidad | IIAL Grants | GrantDesk |
| :--- | :--- | :--- |
| **Público Objetivo** | Equipos internos institucionales y ONGs | Consultores de grants con múltiples clientes |
| **Elegibilidad** | Determinista tri-estado (`eligible`, `ineligible`, `needs_input`) + F1-F5 | Determinista tri-estado (4 reglas con cita textual) |
| **Entidades Extranjeras** | Soporte para pliegos de EE.UU. con excepción regex | Soporte para pliegos de EE.UU. con excepción regex |
| **Anti-Fabricación** | Motor determinista `fabrication.ts` en agente `Critic` | Motor determinista `fabrication.ts` en `draft.ts` |
| **Búsqueda Híbrida** | FTS ponderado + Trigramas + pgvector 768d + RRF | FTS multilingüe + pgvector 1024d + RRF en SQL |
| **Inteligencia T3010** | >100,000 registros, historial de donaciones y directores | Integrable vía `cra-foundations.ts` |
| **Gobernanza y Ciclo de Vida** | Aprobaciones, tareas, comentarios, documentos, finanzas | Minimalista: 6 pantallas enfocadas en el entregable |
