-- 0010: workout duration and weekly check-ins.

-- How long a workout took, in minutes. Set when the workout is finished, so
-- reopening it later to fix a set does not change the time.
alter table public.workout_logs add column if not exists duration_minutes int check (duration_minutes between 0 and 1440);

-- Fill it in for workouts that were finished before this update.
update public.workout_logs
set duration_minutes = greatest(1, round(extract(epoch from (finished_at - started_at)) / 60)::int)
where duration_minutes is null
  and started_at is not null
  and finished_at is not null
  and finished_at > started_at
  and finished_at - started_at < interval '6 hours';

-- One weekly check-in per athlete per week (the week is named by its Monday).
create table if not exists public.weekly_check_ins (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  week_start date not null,
  training smallint check (training between 1 and 5),   -- 5 = great week
  nutrition smallint check (nutrition between 1 and 5), -- 5 = fully on track
  recovery smallint check (recovery between 1 and 5),   -- 5 = sleeping and recovering well
  stress smallint check (stress between 1 and 5),       -- 5 = very stressed
  win text,
  struggle text,
  pain text,
  message text,
  coach_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (athlete_id, week_start)
);
create index if not exists weekly_check_ins_week_idx on public.weekly_check_ins (week_start desc);

alter table public.weekly_check_ins enable row level security;
revoke all on public.weekly_check_ins from anon;

drop policy if exists coach_all on public.weekly_check_ins;
create policy coach_all on public.weekly_check_ins for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists own_weekly_check_ins on public.weekly_check_ins;
create policy own_weekly_check_ins on public.weekly_check_ins for all to authenticated
  using (athlete_id = public.my_athlete_id())
  with check (athlete_id = public.my_athlete_id());
