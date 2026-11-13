-- 0005: free workouts and extra exercises.
-- An athlete (or the coach for them) can start a workout without a plan, or
-- add an exercise to a planned workout. Those exercises live here, on the
-- workout itself, instead of in a program.

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null references public.workout_logs (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  exercise_id uuid references public.exercises (id) on delete set null,
  display_name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists workout_exercises_log_idx on public.workout_exercises (workout_log_id);

alter table public.set_logs
  add column if not exists workout_exercise_id uuid references public.workout_exercises (id) on delete cascade;

-- One row per set of an extra exercise, so saving twice updates instead of duplicating.
create unique index if not exists set_logs_one_per_extra_set
  on public.set_logs (workout_log_id, workout_exercise_id, set_number);

alter table public.workout_exercises enable row level security;
revoke all on public.workout_exercises from anon;

drop policy if exists coach_all on public.workout_exercises;
create policy coach_all on public.workout_exercises for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists own_workout_exercises on public.workout_exercises;
create policy own_workout_exercises on public.workout_exercises for all to authenticated
  using (athlete_id = public.my_athlete_id())
  with check (
    athlete_id = public.my_athlete_id()
    and exists (
      select 1 from public.workout_logs w
      where w.id = workout_exercises.workout_log_id and w.athlete_id = public.my_athlete_id()
    )
  );

-- An athlete may throw away their own workout while it is not finished yet.
drop policy if exists own_workout_logs_delete on public.workout_logs;
create policy own_workout_logs_delete on public.workout_logs for delete to authenticated
  using (athlete_id = public.my_athlete_id() and finished_at is null);

-- "Previous" on the logging screen: also count earlier workouts on the same
-- day (two sessions in one day), but never the workout that is open.
create or replace function public.previous_sets(p_athlete uuid, p_exercises uuid[], p_before date, p_exclude uuid)
returns table (exercise_id uuid, set_number int, weight numeric, reps int, seconds numeric, distance numeric, performed_on date)
language sql
stable
security invoker
set search_path = ''
as $$
  with latest as (
    select distinct on (s.exercise_id) s.exercise_id, s.workout_log_id, w.performed_on
    from public.set_logs s
    join public.workout_logs w on w.id = s.workout_log_id
    where s.athlete_id = p_athlete
      and s.exercise_id = any (p_exercises)
      and not s.skipped
      and w.performed_on <= p_before
      and w.id <> p_exclude
    order by s.exercise_id, w.performed_on desc, w.created_at desc
  )
  select s.exercise_id, s.set_number, s.weight, s.reps, s.seconds, s.distance, l.performed_on
  from latest l
  join public.set_logs s on s.workout_log_id = l.workout_log_id and s.exercise_id = l.exercise_id
  where not s.skipped
  order by s.exercise_id, s.set_number;
$$;
