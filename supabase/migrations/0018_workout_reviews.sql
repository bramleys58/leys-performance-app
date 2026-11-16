-- Coach feedback on finished workouts. A separate table so athletes, who can
-- edit their own workouts, can never change what the coach wrote.
-- Safe to run more than once.
create table if not exists public.workout_reviews (
  workout_log_id uuid primary key references public.workout_logs (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  reply text check (char_length(reply) <= 2000),
  reviewed_at timestamptz not null default now(),
  reply_seen_at timestamptz
);
create index if not exists workout_reviews_athlete_idx on public.workout_reviews (athlete_id, reviewed_at desc);

alter table public.workout_reviews enable row level security;
revoke all on public.workout_reviews from anon;

drop policy if exists coach_all on public.workout_reviews;
create policy coach_all on public.workout_reviews for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- Athletes can read the feedback on their own workouts, nothing more.
drop policy if exists own_reviews_read on public.workout_reviews;
create policy own_reviews_read on public.workout_reviews for select to authenticated
  using (athlete_id = public.my_athlete_id());

-- The one thing an athlete may change: that they have read the reply.
create or replace function public.mark_reply_seen(p_workout_log_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.workout_reviews
  set reply_seen_at = now()
  where workout_log_id = p_workout_log_id
    and athlete_id = public.my_athlete_id()
    and reply is not null
    and reply_seen_at is null;
$$;
revoke all on function public.mark_reply_seen(uuid) from public, anon;
grant execute on function public.mark_reply_seen(uuid) to authenticated;

notify pgrst, 'reload schema';
