-- Chat between coach and athlete: one thread per athlete, with text, photos and
-- videos, optionally about a workout. Plus phone notification subscriptions.
-- Safe to run more than once.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes (id) on delete cascade,
  from_coach boolean not null,
  body text check (char_length(body) <= 4000),
  media_path text,                       -- in the private "chat" bucket, "<athlete_id>/<file>"
  media_kind text check (media_kind in ('video', 'image')),
  media_removed boolean not null default false, -- media is deleted after 30 days, text stays
  workout_log_id uuid references public.workout_logs (id) on delete set null,
  read_at timestamptz,                   -- when the other side read it
  created_at timestamptz not null default now(),
  check (coalesce(char_length(body), 0) > 0 or media_path is not null or media_removed)
);
create index if not exists messages_thread_idx on public.messages (athlete_id, created_at desc);
create index if not exists messages_unread_idx on public.messages (from_coach, athlete_id) where read_at is null;
create index if not exists messages_media_idx on public.messages (created_at) where media_path is not null;

alter table public.messages enable row level security;
revoke all on public.messages from anon;

drop policy if exists coach_all on public.messages;
create policy coach_all on public.messages for all to authenticated
  using (public.is_coach()) with check (public.is_coach());
drop policy if exists athlete_read on public.messages;
create policy athlete_read on public.messages for select to authenticated
  using (athlete_id = public.my_athlete_id());
-- Athletes only write in their own thread, as themselves, with their own files and workouts.
drop policy if exists athlete_insert on public.messages;
create policy athlete_insert on public.messages for insert to authenticated
  with check (
    athlete_id = public.my_athlete_id()
    and from_coach = false
    and read_at is null
    and media_removed = false
    and (media_path is null or media_path like public.my_athlete_id()::text || '/%')
    and (workout_log_id is null or exists (select 1 from public.workout_logs w where w.id = workout_log_id and w.athlete_id = public.my_athlete_id()))
  );

-- Marks the other side's messages in a thread as read. Athletes only their own thread.
create or replace function public.mark_chat_read(p_athlete uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.is_coach() then
    update public.messages set read_at = now() where athlete_id = p_athlete and from_coach = false and read_at is null;
  elsif p_athlete = public.my_athlete_id() then
    update public.messages set read_at = now() where athlete_id = p_athlete and from_coach = true and read_at is null;
  end if;
end $$;
revoke all on function public.mark_chat_read(uuid) from public, anon;
grant execute on function public.mark_chat_read(uuid) to authenticated;

-- Phone notifications: one row per phone or browser that allowed them.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
drop policy if exists own_all on public.push_subscriptions;
create policy own_all on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Private bucket, 50 MB per file. Only the app's server hands out upload and view links.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('chat', 'chat', false, 52428800)
    on conflict (id) do update set public = false, file_size_limit = 52428800;
  end if;
end $$;

notify pgrst, 'reload schema';

-- Key pair for phone notifications, made by the app itself on first use.
-- No policies: only the app's server (secret key) can read it.
create table if not exists public.app_keys (
  id int primary key default 1 check (id = 1),
  vapid_public text not null,
  vapid_private text not null,
  created_at timestamptz not null default now()
);
alter table public.app_keys enable row level security;
revoke all on public.app_keys from anon, authenticated;

notify pgrst, 'reload schema';
