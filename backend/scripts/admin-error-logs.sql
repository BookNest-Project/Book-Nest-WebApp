-- System error logs for admin Reports → Error Logs
-- Run in Supabase SQL Editor or: npm run setup:error-logs (with SUPABASE_DB_URL)

create table if not exists public.system_error_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'error' check (level in ('error', 'warn', 'info')),
  message text not null,
  code text,
  status_code int,
  path text,
  method text,
  user_id uuid references public.users (id) on delete set null,
  stack text,
  metadata jsonb,
  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists system_error_logs_created_idx
  on public.system_error_logs (created_at desc);

create index if not exists system_error_logs_level_idx
  on public.system_error_logs (level);

create index if not exists system_error_logs_resolved_idx
  on public.system_error_logs (resolved);
