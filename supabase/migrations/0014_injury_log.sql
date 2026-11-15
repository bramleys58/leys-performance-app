-- Injury log: the coach's own notes per athlete about pain and injuries.
-- Only the coach can read or write it. Safe to run more than once.
create table if not exists public.injury_notes (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  day date not null default current_date,
  area text,                         -- e.g. "left knee"
  note text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_on date,
  created_at timestamptz not null default now()
);
create index if not exists injury_notes_athlete_idx on public.injury_notes (athlete_id, day desc);

alter table public.injury_notes enable row level security;
revoke all on public.injury_notes from anon;

drop policy if exists coach_all on public.injury_notes;
create policy coach_all on public.injury_notes for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

notify pgrst, 'reload schema';
