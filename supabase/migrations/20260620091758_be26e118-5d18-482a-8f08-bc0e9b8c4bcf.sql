-- Discovery v2: wipe existing grant data and extend funders/grants schema.
truncate table public.grant_events, public.grant_evaluations, public.grants, public.discovery_sources restart identity cascade;
delete from public.funders;

alter table public.funders add column if not exists source_urls text[] not null default '{}';
alter table public.grants add column if not exists canonical_key text;
create unique index if not exists grants_canonical_key_uidx on public.grants(canonical_key) where canonical_key is not null;
alter table public.discovery_sources add column if not exists parent_url text;

-- Seed v2 funders (Canada). Start with 5 active; others inactive to save credits.
insert into public.funders (name, name_fr, country, jurisdiction, website, source_type, source_url, active) values
('Innovation Canada','Innovation Canada','CA','federal','https://innovation.ised-isde.canada.ca','html','https://innovation.ised-isde.canada.ca/innovation/s/?language=en_CA',true),
('NRC IRAP','PARI CNRC','CA','federal','https://nrc.canada.ca','html','https://nrc.canada.ca/en/support-technology-innovation',true),
('Mitacs','Mitacs','CA','federal','https://www.mitacs.ca','html','https://www.mitacs.ca/our-programs/',true),
('Trade Commissioner Service','Service des délégués commerciaux','CA','federal','https://www.tradecommissioner.gc.ca','html','https://www.tradecommissioner.gc.ca/funding-financement.aspx?lang=eng',true),
('Investissement Québec','Investissement Québec','CA','QC','https://www.investquebec.com','html','https://www.investquebec.com/quebec/en/financial-products.html',true),
('NSERC','CRSNG','CA','federal','https://www.nserc-crsng.gc.ca','rss','https://www.nserc-crsng.gc.ca/rss/news_nouvelles_eng.xml',false),
('CRA SR&ED','ARC RS&DE','CA','federal','https://www.canada.ca','html','https://www.canada.ca/en/revenue-agency/services/scientific-research-experimental-development-tax-incentive-program.html',false),
('Open Government grants','Subventions du Gouvernement ouvert','CA','federal','https://search.open.canada.ca','html','https://search.open.canada.ca/grants/',false);

grant select on public.funders to authenticated;
grant all on public.funders to service_role;