-- "Tracking only" athletes: people who just log their own training.
-- They get no daily check-in and no weekly check-in. Safe to run more than once.
alter table public.athletes add column if not exists tracking_only boolean not null default false;

notify pgrst, 'reload schema';
