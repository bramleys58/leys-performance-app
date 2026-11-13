-- 0008: testing days.
-- A test day has a list of tests and a list of athletes. Results are entered
-- per attempt; the best attempt is worked out when results are shown.

alter table public.test_events add column if not exists test_ids uuid[] not null default '{}';
alter table public.test_events add column if not exists athlete_ids uuid[] not null default '{}';
alter table public.tests add column if not exists position int not null default 0;
alter table public.tests add column if not exists decimals smallint not null default 2;

-- One value per attempt, so typing a result again replaces it.
create unique index if not exists test_results_one_per_attempt
  on public.test_results (test_event_id, athlete_id, test_id, attempt);

-- A starter set of tests. Edit or add your own in the app.
insert into public.tests (name, category, unit, higher_is_better, decimals, position) values
  ('10 m sprint', 'Speed', 's', false, 2, 10),
  ('20 m sprint', 'Speed', 's', false, 2, 11),
  ('30 m sprint', 'Speed', 's', false, 2, 12),
  ('40 yd dash', 'Speed', 's', false, 2, 13),
  ('Flying 10 m', 'Speed', 's', false, 2, 14),
  ('Pro agility (5-10-5)', 'Change of direction', 's', false, 2, 20),
  ('L-drill (3 cone)', 'Change of direction', 's', false, 2, 21),
  ('Countermovement jump', 'Jumps', 'cm', true, 1, 30),
  ('Squat jump', 'Jumps', 'cm', true, 1, 31),
  ('Broad jump', 'Jumps', 'cm', true, 0, 32),
  ('Triple broad jump', 'Jumps', 'cm', true, 0, 33),
  ('Drop jump RSI', 'Jumps', 'index', true, 2, 34),
  ('Med ball chest throw', 'Throws', 'm', true, 2, 40),
  ('Med ball backward overhead throw', 'Throws', 'm', true, 2, 41),
  ('Med ball rotational throw', 'Throws', 'm', true, 2, 42),
  ('Back squat 1RM', 'Strength', 'kg', true, 1, 50),
  ('Bench press 1RM', 'Strength', 'kg', true, 1, 51),
  ('Trap bar deadlift 1RM', 'Strength', 'kg', true, 1, 52),
  ('Pull-ups max reps', 'Strength', 'reps', true, 0, 53),
  ('Bodyweight', 'Body', 'kg', true, 1, 60)
on conflict (name) do nothing;
