-- A short note per exercise in a workout ("felt heavy", "left knee ok"), written by the
-- athlete (or the coach logging for them) and shown in the summary. Safe to run more than once.
create table if not exists public.workout_exercise_notes (
  workout_log_id uuid not null references public.workout_logs (id) on delete cascade,
  row_key text not null check (char_length(row_key) between 1 and 80),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  exercise_id uuid references public.exercises (id) on delete set null,
  note text not null check (char_length(note) between 1 and 500),
  updated_at timestamptz not null default now(),
  primary key (workout_log_id, row_key)
);
create index if not exists workout_exercise_notes_athlete_idx on public.workout_exercise_notes (athlete_id, exercise_id);

alter table public.workout_exercise_notes enable row level security;
revoke all on public.workout_exercise_notes from anon;

drop policy if exists coach_all on public.workout_exercise_notes;
create policy coach_all on public.workout_exercise_notes for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- Athletes write notes on their own workouts only.
drop policy if exists own_notes on public.workout_exercise_notes;
create policy own_notes on public.workout_exercise_notes for all to authenticated
  using (athlete_id = public.my_athlete_id())
  with check (
    athlete_id = public.my_athlete_id()
    and exists (select 1 from public.workout_logs w where w.id = workout_log_id and w.athlete_id = public.my_athlete_id())
  );

notify pgrst, 'reload schema';
