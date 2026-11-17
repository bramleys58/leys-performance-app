-- Resources: guides, PDFs and links the coach shares with athletes.
-- Files live in a private storage bucket and are only handed out through
-- short-lived links after the app checked who may see them.
-- Safe to run more than once.
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 500),
  category text not null default 'General' check (char_length(category) between 1 and 40),
  kind text not null check (kind in ('file', 'link')),
  url text check (url ~* '^https?://'),
  file_path text,
  file_name text,
  file_size bigint,
  -- null = every athlete, otherwise only this athlete
  athlete_id uuid references public.athletes (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((kind = 'link' and url is not null) or (kind = 'file' and file_path is not null))
);
create index if not exists resources_athlete_idx on public.resources (athlete_id);

alter table public.resources enable row level security;
revoke all on public.resources from anon;

drop policy if exists coach_all on public.resources;
create policy coach_all on public.resources for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
drop policy if exists athlete_read on public.resources;
create policy athlete_read on public.resources for select to authenticated
  using (public.my_athlete_id() is not null and (athlete_id is null or athlete_id = public.my_athlete_id()));

-- Private bucket, 50 MB per file. No storage policies: only the app's server
-- (with the secret key) creates upload and download links.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('resources', 'resources', false, 52428800)
    on conflict (id) do update set public = false, file_size_limit = 52428800;
  end if;
end $$;

notify pgrst, 'reload schema';
