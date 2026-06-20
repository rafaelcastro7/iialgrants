
insert into public.module_flags (module, enabled, description, description_fr) values
  ('compliance', true, 'Compliance center (PIPEDA, Law 25, AIDA)', 'Centre de conformité (LPRPDE, Loi 25, LIAD)'),
  ('privacy',    true, 'Privacy center (consent, DSAR)',           'Centre de confidentialité (consentement, DDAR)')
on conflict (module) do update set
  description = excluded.description,
  description_fr = excluded.description_fr;
