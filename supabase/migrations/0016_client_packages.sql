-- Business: what each client bought (a pack of sessions or a subscription),
-- what it cost, and whether it is paid. Coach only. Safe to run more than once.
create table if not exists public.client_packages (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  name text not null,                                  -- e.g. "10 PT sessions", "Online coaching"
  kind text not null default 'sessions' check (kind in ('sessions', 'subscription')),
  sessions_total int check (sessions_total > 0),       -- packs only
  sessions_used_before int not null default 0 check (sessions_used_before >= 0), -- used before the app
  price numeric(10, 2) check (price >= 0),             -- euro
  start_date date not null default current_date,
  end_date date,                                       -- renewal or expiry date
  paid_on date,
  notes text,
  ended boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists client_packages_athlete_idx on public.client_packages (athlete_id, start_date desc);

alter table public.client_packages enable row level security;
revoke all on public.client_packages from anon;

drop policy if exists coach_all on public.client_packages;
create policy coach_all on public.client_packages for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

notify pgrst, 'reload schema';
