-- Finances: income outside the app's packages (Basic-Fit, Tribes, Peak, partners) and costs,
-- one-off or repeating, plus a few settings. Coach only. Safe to run more than once.
create table if not exists public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income', 'cost')),
  stream text not null check (char_length(stream) between 1 and 60),  -- "Basic-Fit", "Software", ...
  description text check (char_length(description) <= 200),
  amount numeric(10, 2) not null check (amount >= 0),               -- excl. VAT
  vat_rate numeric(4, 1) not null default 0 check (vat_rate in (0, 6, 12, 21)),
  date date not null default current_date,                           -- the day, or the first time when it repeats
  repeat text not null default 'none' check (repeat in ('none', 'monthly', 'quarterly', 'yearly')),
  end_date date,                                                     -- last time a repeat counts
  salary boolean not null default false,                             -- a wage: no VAT, already taxed, kept out of business profit
  created_at timestamptz not null default now()
);
create index if not exists finance_entries_date_idx on public.finance_entries (date);

create table if not exists public.finance_settings (
  id int primary key default 1 check (id = 1),
  year_target numeric(12, 2),                    -- business revenue goal for the year, excl. VAT
  set_aside_pct numeric(4, 1) not null default 40 check (set_aside_pct between 0 and 80),
  package_prices_incl_vat boolean not null default true,
  package_vat_rate numeric(4, 1) not null default 21 check (package_vat_rate in (0, 6, 12, 21))
);
insert into public.finance_settings (id) values (1) on conflict (id) do nothing;

alter table public.finance_entries enable row level security;
alter table public.finance_settings enable row level security;
revoke all on public.finance_entries from anon;
revoke all on public.finance_settings from anon;
drop policy if exists coach_all on public.finance_entries;
create policy coach_all on public.finance_entries for all to authenticated using (public.is_coach()) with check (public.is_coach());
drop policy if exists coach_all on public.finance_settings;
create policy coach_all on public.finance_settings for all to authenticated using (public.is_coach()) with check (public.is_coach());

notify pgrst, 'reload schema';
