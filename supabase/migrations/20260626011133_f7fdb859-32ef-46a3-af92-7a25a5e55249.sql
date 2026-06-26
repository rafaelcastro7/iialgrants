
CREATE TABLE IF NOT EXISTS public.crawl_ledger (
  url               text PRIMARY KEY,
  host              text NOT NULL,
  funder_id         uuid REFERENCES public.funders(id) ON DELETE SET NULL,
  last_fetched_at   timestamptz,
  next_fetch_at     timestamptz NOT NULL DEFAULT now(),
  interval_hours    integer     NOT NULL DEFAULT 24,
  content_hash      text,
  etag              text,
  last_modified     text,
  change_count      integer     NOT NULL DEFAULT 0,
  status            text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','ok','unchanged','changed','gone','blocked','error')),
  http_status       integer,
  fetch_count       integer     NOT NULL DEFAULT 0,
  error_count       integer     NOT NULL DEFAULT 0,
  last_error        text,
  via               text,
  bytes             integer,
  title             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crawl_ledger_due_idx
  ON public.crawl_ledger (next_fetch_at)
  WHERE status NOT IN ('gone','blocked');

CREATE INDEX IF NOT EXISTS crawl_ledger_host_idx ON public.crawl_ledger (host);
CREATE INDEX IF NOT EXISTS crawl_ledger_funder_idx ON public.crawl_ledger (funder_id);

GRANT SELECT ON public.crawl_ledger TO authenticated;
GRANT ALL    ON public.crawl_ledger TO service_role;

ALTER TABLE public.crawl_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crawl_ledger admin read" ON public.crawl_ledger;
CREATE POLICY "crawl_ledger admin read"
  ON public.crawl_ledger FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS crawl_ledger_set_updated_at ON public.crawl_ledger;
CREATE TRIGGER crawl_ledger_set_updated_at
  BEFORE UPDATE ON public.crawl_ledger
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
