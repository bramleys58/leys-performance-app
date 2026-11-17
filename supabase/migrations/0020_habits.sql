-- Habits the coach sets per athlete, and the days the athlete ticked them off.
-- Safe to run more than once.
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  target_per_week int not null default 7 check (target_per_week between 1 and 7),
  position int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists habits_athlete_idx on public.habits (athlete_id) where not archived;

-- A row means "done that day". Un-ticking deletes it.
create table if not exists public.habit_logs (
  habit_id uuid not null references public.habits (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (habit_id, day)
);
create index if not exists habit_logs_athlete_idx on public.habit_logs (athlete_id, day);

alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
revoke all on public.habits from anon;
revoke all on public.habit_logs from anon;

drop policy if exists coach_all on public.habits;
create policy coach_all on public.habits for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
drop policy if exists own_habits_read on public.habits;
create policy own_habits_read on public.habits for select to authenticated
  using (athlete_id = public.my_athlete_id());

drop policy if exists coach_all on public.habit_logs;
create policy coach_all on public.habit_logs for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
-- Athletes tick their own habits, for today or earlier, never ahead.
drop policy if exists own_habit_logs on public.habit_logs;
create policy own_habit_logs on public.habit_logs for all to authenticated
  using (athlete_id = public.my_athlete_id())
  with check (
    athlete_id = public.my_athlete_id()
    and day <= current_date + 1
    and day >= current_date - 60
    and exists (select 1 from public.habits h where h.id = habit_id and h.athlete_id = public.my_athlete_id() and not h.archived)
  );

notify pgrst, 'reload schema';
