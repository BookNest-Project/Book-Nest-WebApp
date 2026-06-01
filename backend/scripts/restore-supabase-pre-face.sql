-- Restore Supabase auth metadata after face-recognition experiments.
-- Run in Supabase Dashboard → SQL Editor → New query → Run
-- Safe: only removes face_auth from auth users and drops optional face tables.

-- 1) Remove face recognition blobs from auth user metadata (API merge cannot delete keys)
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data - 'face_auth'
WHERE raw_user_meta_data ? 'face_auth';

-- 2) Drop face-auth tables if they were created (optional; skip if you get "does not exist")
DROP TABLE IF EXISTS public.face_auth_logs CASCADE;
DROP TABLE IF EXISTS public.face_auth_challenges CASCADE;
DROP TABLE IF EXISTS public.admin_face_auth CASCADE;

-- 3) Verify: should return zero rows
SELECT email, raw_user_meta_data ? 'face_auth' AS still_has_face_auth
FROM auth.users
WHERE raw_user_meta_data ? 'face_auth';
