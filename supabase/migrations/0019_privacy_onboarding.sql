-- Privacy notice agreement and first-login setup.
-- Safe to run more than once.
alter table public.athletes add column if not exists privacy_accepted_at timestamptz;

-- Agreeing to the privacy notice also covers check-ins (it explains them),
-- so the separate check-in consent is set too.
create or replace function public.accept_privacy()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.athletes
  set privacy_accepted_at = coalesce(privacy_accepted_at, now()),
      checkin_consent_at = coalesce(checkin_consent_at, now())
  where user_id = (select auth.uid());
$$;
revoke all on function public.accept_privacy() from public, anon;
grant execute on function public.accept_privacy() to authenticated;

-- Athletes choose their own unit; they cannot change anything else on their profile.
create or replace function public.set_my_unit(p_unit text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.athletes
  set unit = p_unit::public.weight_unit
  where user_id = (select auth.uid())
    and p_unit in ('kg', 'lbs');
$$;
revoke all on function public.set_my_unit(text) from public, anon;
grant execute on function public.set_my_unit(text) to authenticated;

notify pgrst, 'reload schema';
