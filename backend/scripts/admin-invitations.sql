-- Admin invitations — paste into Supabase SQL Editor → Run
-- Or: add SUPABASE_DB_URL to backend/.env then run: npm run setup:invitations

create table if not exists public.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  recipient_name text not null,
  recipient_email text not null,
  role_type text not null check (role_type in ('user', 'author', 'publisher')),
  subject text not null,
  message text not null,
  invitation_token text not null unique,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'expired')),
  expires_at timestamptz not null,
  created_by uuid references public.users (id) on delete set null,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint admin_invitations_recipient_name_trimmed
    check (length(btrim(recipient_name)) >= 2),
  constraint admin_invitations_message_length
    check (length(btrim(message)) >= 10)
);

create index if not exists admin_invitations_email_idx
  on public.admin_invitations (lower(recipient_email));

create index if not exists admin_invitations_status_idx
  on public.admin_invitations (status);

create index if not exists admin_invitations_role_idx
  on public.admin_invitations (role_type);

create index if not exists admin_invitations_created_by_idx
  on public.admin_invitations (created_by);

alter table public.admin_invitations enable row level security;

grant select, insert, update, delete on public.admin_invitations to service_role;
grant select, insert, update, delete on public.admin_invitations to authenticated;

notify pgrst, 'reload schema';
