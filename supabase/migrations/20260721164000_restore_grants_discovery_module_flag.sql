-- Ensure the discoverer kill-switch exists after DRP/migration rebuilds.
-- A prior module normalization migration removed `grants_discovery`, while
-- the discovery orchestrator still checks this exact module before running.
insert into public.module_flags (module, enabled, description, description_fr)
values (
  'grants_discovery',
  true,
  'Automated grant discovery agent',
  'Agent de découverte automatique de subventions'
)
on conflict (module) do update set
  enabled = true,
  description = excluded.description,
  description_fr = excluded.description_fr;
