-- Admin book review workflow extensions (safe to re-run in Supabase SQL editor)

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'book_status' and e.enumlabel = 'changes_requested'
  ) then
    alter type public.book_status add value 'changes_requested';
  end if;
exception
  when duplicate_object then null;
end $$;

alter table public.books
  add column if not exists version_number text not null default '1.0';

alter table public.books
  add column if not exists review_state jsonb not null default '{}'::jsonb;

create table if not exists public.author_revenue_agreements (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references public.users (id) on delete cascade,
  agreement_version text not null default '1.0',
  accepted_at timestamptz not null default timezone('utc', now()),
  author_name text,
  author_email citext,
  ip_address inet,
  signature_data jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint author_revenue_agreements_user_version unique (author_user_id, agreement_version)
);

create index if not exists author_revenue_agreements_user_idx
  on public.author_revenue_agreements (author_user_id, accepted_at desc);

create table if not exists public.book_update_requests (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'changes_requested')),
  proposed_snapshot jsonb not null,
  previous_snapshot jsonb,
  proposed_formats jsonb,
  previous_formats jsonb,
  update_note text,
  submitted_by uuid references public.users (id) on delete set null,
  reviewed_by_admin_id uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  admin_feedback text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists book_update_requests_book_status_idx
  on public.book_update_requests (book_id, status, created_at desc);

create table if not exists public.book_versions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  version_label text not null,
  status text not null
    check (status in ('approved', 'rejected', 'superseded')),
  snapshot jsonb not null,
  formats_snapshot jsonb,
  approved_by_admin_id uuid references public.users (id) on delete set null,
  rejected_by_admin_id uuid references public.users (id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists book_versions_book_idx
  on public.book_versions (book_id, created_at desc);

create table if not exists public.book_review_audit (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  admin_id uuid references public.users (id) on delete set null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  comments text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists book_review_audit_book_idx
  on public.book_review_audit (book_id, created_at desc);
