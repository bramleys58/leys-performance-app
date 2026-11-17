-- How often each exercise is used: rows in programs plus workouts it was logged in.
-- Used to list the exercises that most need a video first. Runs with the caller's rights,
-- so row security decides what is counted (the coach sees everything).
create or replace function public.exercise_usage()
returns table (exercise_id uuid, uses bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select exercise_id, sum(n)::bigint as uses
  from (
    select exercise_id, count(*) as n from public.session_exercises where exercise_id is not null group by exercise_id
    union all
    select exercise_id, count(distinct workout_log_id) from public.set_logs where exercise_id is not null and not skipped group by exercise_id
  ) t
  group by exercise_id
$$;

revoke all on function public.exercise_usage() from public, anon;
grant execute on function public.exercise_usage() to authenticated;

notify pgrst, 'reload schema';
