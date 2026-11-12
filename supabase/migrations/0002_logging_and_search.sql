-- 0002: support for the program builder search and for saving sets.
-- Safe to run once after 0001_init.sql.

-- One row per planned set, so saving the same set twice updates it instead
-- of creating a duplicate (important on a weak gym connection).
create unique index if not exists set_logs_one_per_planned_set
  on public.set_logs (workout_log_id, session_exercise_id, set_number);

-- An athlete can have one open workout per session per day.
create unique index if not exists workout_logs_one_per_session_day
  on public.workout_logs (athlete_id, session_id, performed_on);

-- Library search used while typing in the program builder.
-- Matches the name and the aliases, names that start with the text first.
create or replace function public.search_exercises(q text)
returns setof public.exercises
language sql
stable
security invoker
set search_path = ''
as $$
  select e.*
  from public.exercises e
  where not e.archived
    and length(trim(q)) >= 2
    and (
      e.name ilike '%' || trim(q) || '%'
      or exists (select 1 from unnest(e.aliases) a where a ilike '%' || trim(q) || '%')
    )
  order by (e.name ilike trim(q) || '%') desc, length(e.name), e.name
  limit 12;
$$;

-- The most recent logged set per exercise for one athlete ("last time").
create or replace function public.last_sets(p_athlete uuid, p_exercises uuid[])
returns table (exercise_id uuid, weight numeric, reps int, seconds numeric, distance numeric, performed_on date)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (s.exercise_id)
    s.exercise_id, s.weight, s.reps, s.seconds, s.distance, w.performed_on
  from public.set_logs s
  join public.workout_logs w on w.id = s.workout_log_id
  where s.athlete_id = p_athlete
    and s.exercise_id = any (p_exercises)
    and not s.skipped
  order by s.exercise_id, w.performed_on desc, s.set_number desc;
$$;
