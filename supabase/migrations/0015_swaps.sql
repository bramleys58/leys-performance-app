-- Exercise swaps: alternatives the coach approved per exercise, and the swap an
-- athlete made in one workout. Safe to run more than once.

create table if not exists public.exercise_alternatives (
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  alternative_id uuid not null references public.exercises (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (exercise_id, alternative_id),
  check (exercise_id <> alternative_id)
);

alter table public.exercise_alternatives enable row level security;
revoke all on public.exercise_alternatives from anon;

drop policy if exists coach_all on public.exercise_alternatives;
create policy coach_all on public.exercise_alternatives for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists alternatives_read on public.exercise_alternatives;
create policy alternatives_read on public.exercise_alternatives for select to authenticated using (true);

-- One planned exercise replaced by another, for one workout only.
create table if not exists public.workout_swaps (
  workout_log_id uuid not null references public.workout_logs (id) on delete cascade,
  session_exercise_id uuid not null references public.session_exercises (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  exercise_name text not null,
  created_at timestamptz not null default now(),
  primary key (workout_log_id, session_exercise_id)
);

alter table public.workout_swaps enable row level security;
revoke all on public.workout_swaps from anon;

drop policy if exists coach_all on public.workout_swaps;
create policy coach_all on public.workout_swaps for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- An athlete can swap inside their own workout, and only to an approved alternative.
drop policy if exists own_swaps on public.workout_swaps;
create policy own_swaps on public.workout_swaps for all to authenticated
  using (
    exists (select 1 from public.workout_logs w where w.id = workout_swaps.workout_log_id and w.athlete_id = public.my_athlete_id())
  )
  with check (
    exists (select 1 from public.workout_logs w where w.id = workout_swaps.workout_log_id and w.athlete_id = public.my_athlete_id())
    and exists (
      select 1
      from public.session_exercises se
      join public.exercise_alternatives ea on ea.exercise_id = se.exercise_id
      where se.id = workout_swaps.session_exercise_id and ea.alternative_id = workout_swaps.exercise_id
    )
  );

notify pgrst, 'reload schema';
