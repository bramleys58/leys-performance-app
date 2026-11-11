-- Leys Performance platform: phase 1 + 2 schema
-- Run once in the Supabase SQL editor (or via the Supabase CLI).
--
-- Model in one sentence: plans say what should happen (programs, sessions,
-- session_exercises), logs say what did happen (workout_logs, set_logs), and
-- every number in the app is calculated from the logs.
--
-- Access rule in one sentence: a coach can do everything, an athlete can only
-- read their own plan and read/write their own logs. This is enforced here in
-- the database (row level security), not only in the screens.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('coach', 'athlete');
create type public.athlete_status as enum ('active', 'paused', 'archived');
create type public.weight_unit as enum ('kg', 'lbs');
create type public.notes_language as enum ('en', 'nl');
create type public.tracking_type as enum (
  'load',             -- kg and reps            (Bench Press)
  'bodyweight_reps',  -- reps, optional added kg (Chin-Up)
  'time',             -- seconds                 (Copenhagen Plank)
  'distance',         -- metres                  (Sled March, Carry)
  'distance_height',  -- metres or cm, best value (Broad Jump)
  'reps_only',        -- reps or contacts, no PR (Pogo Jump)
  'completion'        -- done or not             (stretch, prep)
);
create type public.program_status as enum ('draft', 'active', 'archived');
create type public.session_kind as enum ('workout', 'routine', 'slot');
create type public.session_section as enum ('prep', 'workout');
create type public.target_type as enum ('none', 'weight', 'percent', 'rpe');
create type public.max_source as enum ('tested', 'estimated');

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------

-- One row per login. Created automatically when a user is invited.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'athlete',
  full_name text,
  created_at timestamptz not null default now()
);

-- One row per coached person. user_id is optional: an in-person client can
-- exist without a login, because the coach logs for them.
create table public.athletes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  coach_id uuid references public.profiles (id) on delete set null,
  full_name text not null,
  email text,
  sport text,
  phase text,
  unit public.weight_unit not null default 'kg',
  notes_language public.notes_language not null default 'en',
  status public.athlete_status not null default 'active',
  is_in_person boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index athletes_user_id_idx on public.athletes (user_id);

-- ---------------------------------------------------------------------------
-- Exercise library
-- ---------------------------------------------------------------------------
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  aliases text[] not null default '{}',
  movement_pattern text,
  primary_muscle text,
  equipment text,
  tracking_type public.tracking_type not null default 'load',
  weight_step numeric(5, 2) not null default 2.5,
  counts_for_maxes boolean not null default false,
  default_sets int,
  default_reps text,
  default_tempo text,
  default_note text,
  video_url text,
  alt_video_url text,
  needs_review boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index exercises_name_key on public.exercises (lower(name));
create index exercises_pattern_idx on public.exercises (movement_pattern);

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid references public.athletes (id) on delete cascade, -- null for a template
  name text not null,
  phase text,
  block text,
  start_date date,
  status public.program_status not null default 'draft',
  is_template boolean not null default false,
  created_at timestamptz not null default now()
);
create index programs_athlete_idx on public.programs (athlete_id);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  name text not null,
  kind public.session_kind not null default 'workout', -- routine = tick-off list, slot = named slot without exercises
  session_type text,                 -- Strength, Speed / Power, Conditioning, Mobility, Recovery
  position int not null default 0,
  weekday smallint check (weekday between 1 and 7), -- 1 = Monday. Repeats weekly.
  scheduled_date date,               -- or a fixed date instead of a weekday
  estimated_minutes int,
  is_optional boolean not null default false,
  instructions text,
  created_at timestamptz not null default now()
);
create index sessions_program_idx on public.sessions (program_id);

create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  exercise_id uuid references public.exercises (id) on delete set null,
  display_name text not null,        -- exactly as the coach typed it
  section public.session_section not null default 'workout',
  superset_group text,               -- A, B, C ...
  position int not null default 0,
  sets int,
  reps text,                         -- free text: "8 ea", "6-8", "30s each"
  tempo text,                        -- free text: "3-0-X-0", "FAST"
  target_type public.target_type not null default 'none',
  target_value numeric(7, 2),        -- kg, percent of max, or RPE
  ask_rpe boolean not null default false,
  coaching_note text,
  video_url text,                    -- overrides the library video for this row
  video_start_seconds int
);
create index session_exercises_session_idx on public.session_exercises (session_id);

-- ---------------------------------------------------------------------------
-- Logs
-- ---------------------------------------------------------------------------
create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  session_name text,                 -- kept so history survives a deleted program
  performed_on date not null default current_date,
  started_at timestamptz,
  finished_at timestamptz,
  session_rpe smallint check (session_rpe between 1 and 10),
  felt text,
  comment text,
  logged_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index workout_logs_athlete_date_idx on public.workout_logs (athlete_id, performed_on desc);

create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null references public.workout_logs (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  session_exercise_id uuid references public.session_exercises (id) on delete set null,
  exercise_id uuid references public.exercises (id) on delete set null,
  exercise_name text not null,
  set_number int not null,
  weight numeric(7, 2),              -- always stored in kg
  reps int,
  seconds numeric(7, 2),
  distance numeric(8, 2),
  rpe numeric(3, 1),
  planned_weight numeric(7, 2),
  planned_reps text,
  skipped boolean not null default false,
  skip_reason text,
  note text,
  logged_at timestamptz not null default now()
);
create index set_logs_workout_idx on public.set_logs (workout_log_id);
create index set_logs_athlete_exercise_idx on public.set_logs (athlete_id, exercise_id, logged_at desc);

-- ---------------------------------------------------------------------------
-- Testing and maxes
-- ---------------------------------------------------------------------------
create table public.tests (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  unit text not null,
  higher_is_better boolean not null default true,
  exercise_id uuid references public.exercises (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.test_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  held_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create table public.test_results (
  id uuid primary key default gen_random_uuid(),
  test_event_id uuid references public.test_events (id) on delete cascade,
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  test_id uuid not null references public.tests (id) on delete cascade,
  value numeric(9, 3) not null,
  attempt smallint not null default 1,
  is_best boolean not null default false,
  recorded_at timestamptz not null default now()
);
create index test_results_athlete_idx on public.test_results (athlete_id, test_id);

create table public.maxes (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  value numeric(7, 2) not null,      -- kg
  source public.max_source not null default 'tested',
  set_on date not null default current_date,
  is_active boolean not null default true, -- the working max used for percent-based weights
  created_at timestamptz not null default now()
);
create unique index maxes_one_active_idx on public.maxes (athlete_id, exercise_id) where is_active;

-- ---------------------------------------------------------------------------
-- Helper functions used by the access rules
-- ---------------------------------------------------------------------------
create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'coach'
  );
$$;

create or replace function public.my_athlete_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.id from public.athletes a where a.user_id = (select auth.uid()) limit 1;
$$;

-- Create a profile for every new login, and link it to an athlete row that
-- the coach already made with the same email address.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;

  update public.athletes
  set user_id = new.id
  where user_id is null and email is not null and lower(email) = lower(new.email);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.athletes enable row level security;
alter table public.exercises enable row level security;
alter table public.programs enable row level security;
alter table public.sessions enable row level security;
alter table public.session_exercises enable row level security;
alter table public.workout_logs enable row level security;
alter table public.set_logs enable row level security;
alter table public.tests enable row level security;
alter table public.test_events enable row level security;
alter table public.test_results enable row level security;
alter table public.maxes enable row level security;

-- Coach: full access to everything.
create policy coach_all on public.profiles for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy coach_all on public.athletes for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy coach_all on public.exercises for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy coach_all on public.programs for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy coach_all on public.sessions for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy coach_all on public.session_exercises for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy coach_all on public.workout_logs for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy coach_all on public.set_logs for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy coach_all on public.tests for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy coach_all on public.test_events for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy coach_all on public.test_results for all to authenticated using (public.is_coach()) with check (public.is_coach());
create policy coach_all on public.maxes for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- Everyone logged in: read own profile, read the exercise library and test definitions.
create policy own_profile_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy library_read on public.exercises for select to authenticated using (true);
create policy tests_read on public.tests for select to authenticated using (true);

-- Athlete: read own athlete row.
create policy own_athlete_read on public.athletes for select to authenticated using (user_id = (select auth.uid()));

-- Athlete: read own active programs and what is inside them.
create policy own_programs_read on public.programs for select to authenticated
  using (athlete_id = public.my_athlete_id() and status = 'active');

create policy own_sessions_read on public.sessions for select to authenticated
  using (exists (
    select 1 from public.programs p
    where p.id = sessions.program_id and p.athlete_id = public.my_athlete_id() and p.status = 'active'
  ));

create policy own_session_exercises_read on public.session_exercises for select to authenticated
  using (exists (
    select 1 from public.sessions s
    join public.programs p on p.id = s.program_id
    where s.id = session_exercises.session_id and p.athlete_id = public.my_athlete_id() and p.status = 'active'
  ));

-- Athlete: read and write own logs. No delete: removing a log is a coach action.
create policy own_workout_logs_read on public.workout_logs for select to authenticated using (athlete_id = public.my_athlete_id());
create policy own_workout_logs_insert on public.workout_logs for insert to authenticated with check (athlete_id = public.my_athlete_id());
create policy own_workout_logs_update on public.workout_logs for update to authenticated
  using (athlete_id = public.my_athlete_id()) with check (athlete_id = public.my_athlete_id());

create policy own_set_logs_read on public.set_logs for select to authenticated using (athlete_id = public.my_athlete_id());
create policy own_set_logs_insert on public.set_logs for insert to authenticated
  with check (
    athlete_id = public.my_athlete_id()
    and exists (select 1 from public.workout_logs w where w.id = set_logs.workout_log_id and w.athlete_id = public.my_athlete_id())
  );
create policy own_set_logs_update on public.set_logs for update to authenticated
  using (athlete_id = public.my_athlete_id())
  with check (
    athlete_id = public.my_athlete_id()
    and exists (select 1 from public.workout_logs w where w.id = set_logs.workout_log_id and w.athlete_id = public.my_athlete_id())
  );
create policy own_set_logs_delete on public.set_logs for delete to authenticated using (athlete_id = public.my_athlete_id());

-- Athlete: read own test results and maxes, and the test days they took part in.
create policy own_test_results_read on public.test_results for select to authenticated using (athlete_id = public.my_athlete_id());
create policy own_maxes_read on public.maxes for select to authenticated using (athlete_id = public.my_athlete_id());
create policy own_test_events_read on public.test_events for select to authenticated
  using (exists (
    select 1 from public.test_results r
    where r.test_event_id = test_events.id and r.athlete_id = public.my_athlete_id()
  ));

-- Nothing is readable without a login.
revoke all on all tables in schema public from anon;
