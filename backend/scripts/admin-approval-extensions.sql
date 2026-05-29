-- Run once in Supabase SQL editor (safe to re-run)

alter table public.books
  add column if not exists review_note text;

alter table public.books
  add column if not exists submission_previous jsonb;

alter table public.books
  add column if not exists review_metadata jsonb;

create table if not exists public.book_approved_snapshots (
  book_id uuid primary key references public.books (id) on delete cascade,
  snapshot jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.author_messages (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.users (id) on delete cascade,
  book_id uuid references public.books (id) on delete set null,
  sender_admin_id uuid references public.users (id) on delete set null,
  message_type text not null default 'book_review',
  subject text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.book_review_activity (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  admin_id uuid references public.users (id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists author_messages_recipient_idx
  on public.author_messages (recipient_user_id, created_at desc);

create index if not exists books_status_reviewed_idx
  on public.books (status, reviewed_at desc nulls last);

create index if not exists book_review_activity_book_idx
  on public.book_review_activity (book_id, created_at desc);

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users (id) on delete cascade,
  book_id uuid references public.books (id) on delete cascade,
  notification_type text not null default 'pending_submission',
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists admin_notifications_admin_idx
  on public.admin_notifications (admin_id, created_at desc);
