-- The lifts an athlete follows on their progress page ("My lifts"), chosen by them or the coach.
-- Safe to run more than once.
create table if not exists public.tracked_lifts (
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now(),
  primary key (athlete_id, exercise_id)
);

alter table public.tracked_lifts enable row level security;
revoke all on public.tracked_lifts from anon;

drop policy if exists coach_all on public.tracked_lifts;
create policy coach_all on public.tracked_lifts for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
drop policy if exists own_lifts on public.tracked_lifts;
create policy own_lifts on public.tracked_lifts for all to authenticated
  using (athlete_id = public.my_athlete_id()) with check (athlete_id = public.my_athlete_id());

notify pgrst, 'reload schema';

-- Which exercises can be followed as a main lift: null = decided by pattern and name,
-- true / false = the coach's own choice in the library.
alter table public.exercises add column if not exists main_lift boolean;
notify pgrst, 'reload schema';
