
-- submissions
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  proposal_id uuid not null references public.proposals(id) on delete cascade,
  grant_id uuid not null references public.grants(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  method text not null check (method in ('portal','email','mail','api','other')),
  confirmation_number text,
  language public.app_lang not null default 'en',
  attachments jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.submissions to authenticated;
grant all on public.submissions to service_role;
alter table public.submissions enable row level security;
create policy "Users manage their submissions" on public.submissions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger submissions_updated_at before update on public.submissions
  for each row execute function public.set_updated_at();

-- outcomes
create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  grant_id uuid not null references public.grants(id) on delete cascade,
  result text not null check (result in ('won','lost','withdrawn','no_response')),
  amount_awarded_cad numeric(14,2),
  decision_date date,
  feedback text,
  lessons_learned text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id)
);
grant select, insert, update, delete on public.outcomes to authenticated;
grant all on public.outcomes to service_role;
alter table public.outcomes enable row level security;
create policy "Users manage their outcomes" on public.outcomes
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger outcomes_updated_at before update on public.outcomes
  for each row execute function public.set_updated_at();

-- notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grant_id uuid references public.grants(id) on delete cascade,
  kind text not null check (kind in ('deadline','decision','reminder','system')),
  title_en text not null,
  title_fr text not null,
  body_en text not null,
  body_fr text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "Users read their notifications" on public.notifications
  for select to authenticated using (auth.uid() = user_id);
create policy "Users update their notifications" on public.notifications
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index notifications_user_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;

-- Schedule daily deadline notifier
select cron.schedule(
  'iial-deadline-notifier-daily',
  '0 8 * * *',
  $cron$
  select net.http_post(
    url := 'https://project--2a85edd6-ca38-4db7-af59-50a4626dfb36.lovable.app/api/public/hooks/deadlines',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoc3ZuZWJ5d2FmZHJkZWhnZm91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MDI3OTgsImV4cCI6MjA5NzQ3ODc5OH0.K9XwyMkfPq2136pn9nx5l7-cDwoxTi3tZhEO9yiQ710'
    ),
    body := '{}'::jsonb
  );
  $cron$
);
