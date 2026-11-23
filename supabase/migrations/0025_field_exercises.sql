-- Speed and field work: an exercise can choose its own log columns (kg, reps, time, distance),
-- the unit of its distance (m or cm) and what counts as its best result.
-- All optional: without them an exercise behaves as before. Safe to run more than once.
alter table public.exercises add column if not exists log_fields text[];
alter table public.exercises add column if not exists distance_unit text not null default 'm';
alter table public.exercises add column if not exists best text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exercises_log_fields_check') then
    alter table public.exercises add constraint exercises_log_fields_check
      check (log_fields is null or log_fields <@ array['weight', 'reps', 'seconds', 'distance']::text[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exercises_distance_unit_check') then
    alter table public.exercises add constraint exercises_distance_unit_check check (distance_unit in ('m', 'cm'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exercises_best_check') then
    alter table public.exercises add constraint exercises_best_check check (best is null or best in ('fastest', 'farthest', 'heaviest'));
  end if;
end $$;

notify pgrst, 'reload schema';
