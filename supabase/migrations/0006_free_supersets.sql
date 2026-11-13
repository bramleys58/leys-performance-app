-- 0006: supersets for exercises added during a workout.
alter table public.workout_exercises add column if not exists superset_group text;
