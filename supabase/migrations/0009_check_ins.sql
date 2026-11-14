-- 0009: daily check-ins (sleep, energy, soreness, stress, bodyweight).
-- One check-in per athlete per day. The athlete agrees once that the coach
-- sees these answers; the moment of agreeing is kept on the athlete profile.

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  day date not null default current_date,
  sleep_hours numeric(3, 1) check (sleep_hours between 0 and 24),
  sleep_quality smallint check (sleep_quality between 1 and 5),  -- 5 = great
  energy smallint check (energy between 1 and 5),                -- 5 = full of energy
  soreness smallint check (soreness between 1 and 5),            -- 5 = very sore
  stress smallint check (stress between 1 and 5),                -- 5 = very stressed
  bodyweight numeric(5, 2),                                      -- kg
  note text,
  created_at timestamptz not null default now(),
  unique (athlete_id, day)
);
create index if not exists check_ins_day_idx on public.check_ins (day desc);

alter table public.athletes add column if not exists checkin_consent_at timestamptz;

alter table public.check_ins enable row level security;
revoke all on public.check_ins from anon;

drop policy if exists coach_all on public.check_ins;
create policy coach_all on public.check_ins for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists own_check_ins on public.check_ins;
create policy own_check_ins on public.check_ins for all to authenticated
  using (athlete_id = public.my_athlete_id())
  with check (athlete_id = public.my_athlete_id());

-- An athlete records their own agreement (they cannot edit the rest of their profile).
create or replace function public.agree_to_check_ins()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.athletes
  set checkin_consent_at = coalesce(checkin_consent_at, now())
  where user_id = (select auth.uid());
$$;
