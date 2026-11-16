-- Bodyweight log, separate from the daily check-in so tracking only athletes
-- and the coach can log it too. One value per athlete per day.
-- Safe to run more than once.
create table if not exists public.bodyweights (
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  day date not null default current_date,
  kg numeric(5, 2) not null check (kg > 20 and kg < 400),
  created_at timestamptz not null default now(),
  primary key (athlete_id, day)
);

alter table public.bodyweights enable row level security;
revoke all on public.bodyweights from anon;

drop policy if exists coach_all on public.bodyweights;
create policy coach_all on public.bodyweights for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists own_bodyweights on public.bodyweights;
create policy own_bodyweights on public.bodyweights for all to authenticated
  using (athlete_id = public.my_athlete_id())
  with check (athlete_id = public.my_athlete_id());

notify pgrst, 'reload schema';
