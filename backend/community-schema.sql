-- Community schema additions (chat, messaging, follows)
-- Safe to run multiple times.

begin;

create extension if not exists pgcrypto;

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group')),
  name varchar(120),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_participants (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (chat_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  sender_id uuid not null references public.users (id) on delete cascade,
  content text not null check (length(btrim(content)) > 0),
  is_read boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.users (id) on delete cascade,
  following_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint follows_not_self check (follower_id <> following_id),
  unique (follower_id, following_id)
);

create index if not exists chats_updated_at_idx on public.chats (updated_at desc);
create index if not exists chat_participants_user_idx on public.chat_participants (user_id, chat_id);
create index if not exists messages_chat_created_idx on public.messages (chat_id, created_at desc);
create index if not exists follows_following_idx on public.follows (following_id, created_at desc);
create index if not exists follows_follower_idx on public.follows (follower_id, created_at desc);

create or replace function public.bump_chat_updated_at()
returns trigger
language plpgsql
as $$
begin
  update public.chats
  set updated_at = timezone('utc', now())
  where id = new.chat_id;
  return new;
end;
$$;

drop trigger if exists messages_bump_chat_updated_at on public.messages;
create trigger messages_bump_chat_updated_at
after insert on public.messages
for each row execute function public.bump_chat_updated_at();

commit;
