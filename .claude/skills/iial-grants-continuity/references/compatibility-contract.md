# IIAL Grants compatibility contract

## Scope map

| Concern | Source of truth | Required outcome |
|---|---|---|
| Tenant principal | `profiles.org_id` | Same-org members see shared work; other tenants do not. |
| Shared organization facts | `org_profiles` through `getOrgProfileForUser` | Fit, proposals, audit, discovery and compliance use the same facts. |
| Shared reusable answers | `answer_library` + `knowledge_chunks` | Tenant answers are searchable by FTS/vector and archiving removes retrieval. |
| RLS/service access | Migration policies + `tenant-access.server.ts` | A bare ID never authorizes cross-tenant service-role access. |
| Agent execution | Cloud-first chain, local Ollama fallback | A provider outage degrades rather than breaks. |
| V2 workflow | Readiness, named blockers, human confirmation | The UI explains what is needed before a consequential action. |

## Migration discipline

Append a migration; never edit an applied one. Validate with the local migration runner, refresh PostgREST's schema cache, and test the direct client path plus the server-function path. The current tenant baseline depends on:

- `20260831140000_tenant_grant_readiness_profile.sql`
- `20260831150000_tenant_knowledge_answer_library.sql`

## Evidence required in a handoff

Record: files/migration changed, actual tenant/data assumptions, focused test result, lint/build result, and anything intentionally left as a product choice.
