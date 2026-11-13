-- 0007: exercises added by athletes wait for the coach's approval.
-- A coach's new exercise goes straight into the library (marked for review).
-- An athlete's new exercise is saved too, but only that athlete sees it until
-- the coach approves it or merges it into an existing exercise.

alter table public.exercises add column if not exists created_by uuid references auth.users (id) on delete set null;
alter table public.exercises add column if not exists approved boolean not null default true;

-- Athletes see approved exercises plus the ones they added themselves.
drop policy if exists library_read on public.exercises;
create policy library_read on public.exercises for select to authenticated
  using (approved or created_by = (select auth.uid()));

-- An athlete adds a new exercise name. Returns the id of the exercise to use.
create or replace function public.suggest_exercise(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(btrim(p_name), 120);
  v_id uuid;
begin
  if public.my_athlete_id() is null or v_name = '' then
    return null;
  end if;
  select e.id into v_id from public.exercises e where lower(e.name) = lower(v_name) limit 1;
  if v_id is null then
    insert into public.exercises (name, needs_review, approved, created_by)
    values (v_name, true, false, (select auth.uid()))
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Library search: approved exercises, your own pending ones, everything for the coach.
create or replace function public.search_exercises(q text)
returns setof public.exercises
language sql
stable
security invoker
set search_path = ''
as $$
  select e.*
  from public.exercises e
  where not e.archived
    and length(trim(q)) >= 2
    and (e.approved or e.created_by = (select auth.uid()) or public.is_coach())
    and (
      e.name ilike '%' || trim(q) || '%'
      or exists (select 1 from unnest(e.aliases) a where a ilike '%' || trim(q) || '%')
    )
  order by (e.name ilike trim(q) || '%') desc, length(e.name), e.name
  limit 12;
$$;

-- Merge a duplicate into the exercise to keep. Everything logged or planned
-- with the duplicate moves over, its name becomes an alias, and it is deleted.
create or replace function public.merge_exercise(p_from uuid, p_into uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_aliases text[];
begin
  if not public.is_coach() then
    raise exception 'Only the coach can merge exercises';
  end if;
  if p_from = p_into then
    return;
  end if;
  select name, aliases into v_name, v_aliases from public.exercises where id = p_from;
  if v_name is null then
    return;
  end if;

  update public.session_exercises set exercise_id = p_into where exercise_id = p_from;
  update public.workout_exercises set exercise_id = p_into where exercise_id = p_from;
  update public.set_logs set exercise_id = p_into where exercise_id = p_from;
  update public.tests set exercise_id = p_into where exercise_id = p_from;
  -- Keep the target's working max where both have one.
  update public.maxes m set is_active = false
    where m.exercise_id = p_from and m.is_active
      and exists (select 1 from public.maxes k where k.exercise_id = p_into and k.athlete_id = m.athlete_id and k.is_active);
  update public.maxes set exercise_id = p_into where exercise_id = p_from;

  update public.exercises e
    set aliases = (
      select coalesce(array_agg(distinct a), '{}')
      from unnest(e.aliases || v_name || coalesce(v_aliases, '{}')) a
      where lower(a) <> lower(e.name)
    )
    where e.id = p_into;

  delete from public.exercises where id = p_from;
end;
$$;
