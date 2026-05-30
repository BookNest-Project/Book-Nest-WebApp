-- Add bio column to admin_profiles (run once in Supabase SQL Editor if missing)
alter table public.admin_profiles
  add column if not exists bio text;
