-- Multi-week blocks, fast copying and percent of another lift's max.
-- Safe to run more than once. Nothing existing is changed or removed.

-- A session with a week number only shows in that week of the block.
-- No week number = it repeats every week (as before).
alter table public.sessions add column if not exists week int check (week >= 1);
create index if not exists sessions_program_week_idx on public.sessions (program_id, week);

-- "% of max" can point at another lift (paused bench at 85% of the bench max).
alter table public.session_exercises
  add column if not exists max_exercise_id uuid references public.exercises (id) on delete set null;

-- Copies sessions with all their exercises in one go.
--   whole program:      p_from_week null, p_session null
--   one week to a week: p_from_week and p_to_week
--   one session:        p_session (p_to_week moves the copy to that week)
-- The two deltas change the targets of the copies, for week to week progression.
create or replace function public.clone_sessions(
  p_from_program uuid,
  p_to_program uuid,
  p_from_week int default null,
  p_to_week int default null,
  p_session uuid default null,
  p_percent_delta numeric default 0,
  p_weight_delta numeric default 0,
  p_name_suffix text default ''
) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  s record;
  new_id uuid;
  pos int;
  n int := 0;
begin
  if not public.is_coach() then
    raise exception 'Only the coach can copy sessions';
  end if;
  select coalesce(max(position), -1) into pos from sessions where program_id = p_to_program;

  for s in
    select * from sessions
    where program_id = p_from_program
      and (p_session is null or id = p_session)
      and (p_from_week is null or week = p_from_week)
    order by position, created_at
  loop
    pos := pos + 1;
    insert into sessions (program_id, name, kind, session_type, position, weekday, scheduled_date, estimated_minutes, is_optional, instructions, week)
    values (
      p_to_program, s.name || coalesce(p_name_suffix, ''), s.kind, s.session_type, pos, s.weekday,
      -- A fixed date moves along with the week inside the same program. Elsewhere it is dropped.
      case when p_from_program = p_to_program and p_from_week is not null and p_to_week is not null and s.scheduled_date is not null
           then s.scheduled_date + 7 * (p_to_week - p_from_week) end,
      s.estimated_minutes, s.is_optional, s.instructions,
      coalesce(p_to_week, s.week)
    )
    returning id into new_id;

    insert into session_exercises (session_id, exercise_id, display_name, section, superset_group, position, sets, reps, tempo,
                                   target_type, target_value, ask_rpe, coaching_note, video_url, video_start_seconds, max_exercise_id)
    select new_id, exercise_id, display_name, section, superset_group, position, sets, reps, tempo,
           target_type,
           case
             when target_value is null then null
             when target_type = 'percent' then greatest(target_value + coalesce(p_percent_delta, 0), 0)
             when target_type = 'weight' then greatest(target_value + coalesce(p_weight_delta, 0), 0)
             else target_value
           end,
           ask_rpe, coaching_note, video_url, video_start_seconds, max_exercise_id
    from session_exercises
    where session_id = s.id;

    n := n + 1;
  end loop;
  return n;
end;
$$;

grant execute on function public.clone_sessions(uuid, uuid, int, int, uuid, numeric, numeric, text) to authenticated;

-- Make the API see the new column, link and function straight away.
notify pgrst, 'reload schema';
