-- recordFetch() used to read crawl_ledger, compute counters/cadence in JS,
-- then upsert — a classic read-then-write race when two discovery runs
-- overlap on the same URL (concurrent funder triggers, scheduled run +
-- manual run). This moves the whole read-modify-write into one atomic
-- SQL function: a transaction-scoped advisory lock keyed on the URL
-- serializes concurrent calls, and SELECT ... FOR UPDATE + INSERT ...
-- ON CONFLICT DO UPDATE keeps the counter arithmetic in SQL.

create or replace function public.record_crawl_fetch(
  p_url text,
  p_host text,
  p_funder_id uuid,
  p_outcome_kind text,
  p_content_hash text,
  p_via text,
  p_http_status integer,
  p_etag text,
  p_last_modified text,
  p_bytes integer,
  p_title text,
  p_error_reason text,
  p_default_interval integer
)
returns table (
  next_fetch_at timestamptz,
  status text,
  changed boolean,
  interval_hours integer,
  content_hash text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row            record;
  v_prev_hash      text;
  v_prev_interval  integer;
  v_change_count   integer;
  v_fetch_count    integer;
  v_error_count    integer;
  v_status         text;
  v_next_interval  integer;
  v_out_hash       text;
  v_changed        boolean := false;
  v_last_error     text := null;
  v_etag           text := null;
  v_last_modified  text := null;
  v_http_status    integer := null;
  v_via            text := null;
  v_bytes          integer := null;
  v_title          text := null;
  v_now            timestamptz := now();
  v_next_fetch_at  timestamptz;
begin
  if p_outcome_kind not in ('ok', 'not_modified', 'gone', 'blocked', 'error') then
    raise exception 'invalid_outcome_kind: %', p_outcome_kind;
  end if;

  -- Serializes concurrent recordFetch() calls for the same URL so the
  -- read-modify-write below can never race, even before a row exists
  -- (SELECT ... FOR UPDATE alone can't lock a not-yet-inserted row).
  perform pg_advisory_xact_lock(hashtext('crawl_ledger:' || p_url));

  select cl.content_hash, cl.interval_hours, cl.change_count, cl.fetch_count, cl.error_count
    into v_row
    from public.crawl_ledger cl
   where cl.url = p_url
   for update;

  v_prev_hash := v_row.content_hash;
  v_prev_interval := coalesce(v_row.interval_hours, p_default_interval);
  v_change_count := coalesce(v_row.change_count, 0);
  v_fetch_count := coalesce(v_row.fetch_count, 0) + 1;
  v_error_count := coalesce(v_row.error_count, 0);
  v_out_hash := v_prev_hash;

  if p_outcome_kind = 'ok' then
    v_via := p_via;
    v_http_status := coalesce(p_http_status, 200);
    v_etag := p_etag;
    v_last_modified := p_last_modified;
    v_bytes := p_bytes;
    v_title := p_title;
    if v_prev_hash is not null and v_prev_hash <> p_content_hash then
      v_status := 'changed';
      v_changed := true;
      v_change_count := v_change_count + 1;
      v_next_interval := least(greatest(floor(v_prev_interval * 0.5)::int, 6), 336);
    elsif v_prev_hash = p_content_hash then
      v_status := 'unchanged';
      v_next_interval := least(greatest(floor(v_prev_interval * 1.5)::int, 24), 336);
    else
      v_status := 'ok';
      v_next_interval := 24;
    end if;
    v_out_hash := p_content_hash;

  elsif p_outcome_kind = 'not_modified' then
    v_via := p_via;
    v_http_status := 304;
    v_etag := p_etag;
    v_last_modified := p_last_modified;
    v_status := 'unchanged';
    v_next_interval := least(greatest(floor(v_prev_interval * 1.5)::int, 24), 336);

  elsif p_outcome_kind = 'gone' then
    v_status := 'gone';
    v_http_status := p_http_status;
    v_next_interval := 720;

  elsif p_outcome_kind = 'blocked' then
    v_status := 'blocked';
    v_last_error := p_error_reason;
    v_next_interval := 168;

  elsif p_outcome_kind = 'error' then
    v_status := 'error';
    v_http_status := p_http_status;
    v_last_error := p_error_reason;
    v_error_count := v_error_count + 1;
    v_next_interval := least(greatest(floor(v_prev_interval * 2)::int, 24), 168);
  end if;

  v_next_fetch_at := v_now + (v_next_interval || ' hours')::interval;

  insert into public.crawl_ledger (
    url, host, funder_id, last_fetched_at, next_fetch_at, interval_hours,
    content_hash, etag, last_modified, change_count, status, http_status,
    fetch_count, error_count, last_error, via, bytes, title
  ) values (
    p_url, p_host, p_funder_id, v_now, v_next_fetch_at, v_next_interval,
    v_out_hash, v_etag, v_last_modified, v_change_count, v_status, v_http_status,
    v_fetch_count, v_error_count, v_last_error, v_via, v_bytes, v_title
  )
  on conflict (url) do update set
    host            = excluded.host,
    funder_id       = excluded.funder_id,
    last_fetched_at = excluded.last_fetched_at,
    next_fetch_at   = excluded.next_fetch_at,
    interval_hours  = excluded.interval_hours,
    content_hash    = excluded.content_hash,
    etag            = excluded.etag,
    last_modified   = excluded.last_modified,
    change_count    = excluded.change_count,
    status          = excluded.status,
    http_status     = excluded.http_status,
    fetch_count     = excluded.fetch_count,
    error_count     = excluded.error_count,
    last_error      = excluded.last_error,
    via             = excluded.via,
    bytes           = excluded.bytes,
    title           = excluded.title;

  return query
    select v_next_fetch_at, v_status, v_changed, v_next_interval, v_out_hash;
end;
$$;

revoke all on function public.record_crawl_fetch(
  text, text, uuid, text, text, text, integer, text, text, integer, text, text, integer
) from public;
grant execute on function public.record_crawl_fetch(
  text, text, uuid, text, text, text, integer, text, text, integer, text, text, integer
) to service_role;
