-- Admin user moderation: ban reason + status timestamp
-- Run in Supabase SQL Editor if not already applied.

alter table public.users
  add column if not exists account_status_reason text,
  add column if not exists status_updated_at timestamptz;

comment on column public.users.account_status_reason is 'Admin-provided reason when account is suspended/disabled';
comment on column public.users.status_updated_at is 'When account_status last changed by admin or system';
