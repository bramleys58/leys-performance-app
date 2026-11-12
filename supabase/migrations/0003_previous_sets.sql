-- 0003: the "Previous" column on the logging screen.
-- For each exercise, every set from the athlete's most recent earlier workout
-- that contained that exercise.

create or replace function public.previous_sets(p_athlete uuid, p_exercises uuid[], p_before date)
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
      and w.performed_on < p_before
    order by s.exercise_id, w.performed_on desc, w.created_at desc
  )
  select s.exercise_id, s.set_number, s.weight, s.reps, s.seconds, s.distance, l.performed_on
  from latest l
  join public.set_logs s on s.workout_log_id = l.workout_log_id and s.exercise_id = l.exercise_id
  where not s.skipped
  order by s.exercise_id, s.set_number;
$$;
