-- Admin task log (user moderation, settings, etc.) — complements book_review_activity
create table if not exists public.admin_tasks (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.users (id) on delete set null,
  category text not null default 'general',
  action text not null,
  summary text not null,
  book_id uuid references public.books (id) on delete set null,
  target_user_id uuid references public.users (id) on delete set null,
  details jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists admin_tasks_created_idx
  on public.admin_tasks (created_at desc);

create index if not exists book_review_activity_created_idx
  on public.book_review_activity (created_at desc);
