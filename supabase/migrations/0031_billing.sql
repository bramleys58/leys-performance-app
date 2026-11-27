-- How a client pays: own packages (default), through Peak (the studio pays you), or free.
-- Only "package" clients are flagged when they have no package. Safe to run more than once.
alter table public.athletes add column if not exists billing text not null default 'package';
alter table public.athletes drop constraint if exists athletes_billing_check;
alter table public.athletes add constraint athletes_billing_check check (billing in ('package', 'peak', 'free'));
notify pgrst, 'reload schema';
