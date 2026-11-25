-- Exercise search ignores dashes, spaces and punctuation: "push up", "push-up" and "pushup"
-- all find "Push Up". Safe to run more than once.
alter table public.exercises add column if not exists name_key text
  generated always as (regexp_replace(lower(name), '[^a-z0-9]', '', 'g')) stored;

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
      or e.name_key like '%' || regexp_replace(lower(q), '[^a-z0-9]', '', 'g') || '%'
      or exists (
        select 1 from unnest(e.aliases) a
        where a ilike '%' || trim(q) || '%'
           or regexp_replace(lower(a), '[^a-z0-9]', '', 'g') like '%' || regexp_replace(lower(q), '[^a-z0-9]', '', 'g') || '%'
      )
    )
  order by (e.name ilike trim(q) || '%') desc, length(e.name), e.name
  limit 12;
$$;

notify pgrst, 'reload schema';
