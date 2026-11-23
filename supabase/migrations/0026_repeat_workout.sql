-- "Repeat today": a repeated workout starts with as many sets per exercise as last time.
-- Safe to run more than once.
alter table public.workout_exercises add column if not exists planned_sets int;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workout_exercises_planned_sets_check') then
    alter table public.workout_exercises add constraint workout_exercises_planned_sets_check check (planned_sets is null or planned_sets between 1 and 30);
  end if;
end $$;
-- The workout it repeats: its sets are what "Previous" shows and what gets filled in.
alter table public.workout_logs add column if not exists repeat_of uuid references public.workout_logs (id) on delete set null;
notify pgrst, 'reload schema';
