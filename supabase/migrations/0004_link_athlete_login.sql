-- 0004: link an athlete profile to a login that already exists.
-- 0001 links them when the login is created. This covers the other order:
-- the login exists first and the athlete profile (with the same email) is
-- added or edited afterwards. That is also how a coach gets an athlete view.

create or replace function public.link_athlete_to_login()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null and new.email is not null then
    select u.id into new.user_id
    from auth.users u
    where lower(u.email) = lower(new.email)
      and not exists (select 1 from public.athletes a where a.user_id = u.id and a.id <> new.id)
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists athletes_link_login on public.athletes;
create trigger athletes_link_login
  before insert or update of email on public.athletes
  for each row execute function public.link_athlete_to_login();

-- Link the profiles that were added before this update.
update public.athletes a
set user_id = u.id
from auth.users u
where a.user_id is null
  and a.email is not null
  and lower(u.email) = lower(a.email)
  and not exists (select 1 from public.athletes b where b.user_id = u.id);
