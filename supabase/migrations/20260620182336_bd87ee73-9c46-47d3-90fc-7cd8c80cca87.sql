-- Normalization helper mirroring src/agents/discoverer.impl.server.ts
CREATE OR REPLACE FUNCTION public.normalize_title_v2(t text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  s text;
BEGIN
  IF t IS NULL THEN RETURN ''; END IF;
  s := regexp_replace(t, '\([^)]*\)', ' ', 'g');                -- strip ( ... )
  s := lower(s);
  s := translate(s,
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ',
    'aaaaaaceeeeiiiinooooouuuuyy');
  s := regexp_replace(s, '[^a-z0-9]+', ' ', 'g');
  s := trim(s);
  -- Drop generic stopwords
  s := array_to_string(
    array(
      SELECT w FROM unnest(string_to_array(s, ' ')) w
      WHERE length(w) > 1
        AND w NOT IN ('program','programme','initiative','fund','funding','grant','grants',
                      'subsidy','subsidies','subvention','subventions','aide','aides',
                      'credit','credits','loan','loans','pret','prets','prêt','prêts',
                      'scholarship','bourse','bourses','the','le','la','les','de','du','des')
    ),
    ' ');
  RETURN s;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_title_v2(text) FROM PUBLIC, anon, authenticated;

-- 1. Compute new keys into a temp table.
CREATE TEMP TABLE _grants_rekey AS
SELECT
  id,
  funder_id,
  encode(digest(funder_id::text || '|' || public.normalize_title_v2(title) || '|' ||
                COALESCE(amount_cad_min::text,'_') || '_' || COALESCE(amount_cad_max::text,'_'),
                'sha256'), 'hex') AS new_key,
  discovered_at,
  times_seen
FROM public.grants;

-- 2. Merge duplicates: pick the earliest-discovered row per new_key, sum times_seen.
WITH ranked AS (
  SELECT id, new_key,
         row_number() OVER (PARTITION BY new_key ORDER BY discovered_at ASC NULLS LAST, id) AS rn,
         SUM(COALESCE(times_seen,1)) OVER (PARTITION BY new_key) AS total_seen
  FROM _grants_rekey
)
UPDATE public.grants g
SET times_seen = r.total_seen
FROM ranked r
WHERE g.id = r.id AND r.rn = 1;

-- Delete losers (they collapse into the winner).
WITH ranked AS (
  SELECT id, new_key,
         row_number() OVER (PARTITION BY new_key ORDER BY discovered_at ASC NULLS LAST, id) AS rn
  FROM _grants_rekey
)
DELETE FROM public.grants g
USING ranked r
WHERE g.id = r.id AND r.rn > 1;

-- 3. Now safe to update canonical_key on survivors.
UPDATE public.grants g
SET canonical_key = r.new_key
FROM _grants_rekey r
WHERE g.id = r.id;

DROP TABLE _grants_rekey;