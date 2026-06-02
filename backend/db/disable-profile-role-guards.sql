-- Remove DB triggers that block author/publisher/admin profile rows when users.role
-- does not match. App-level validation in profileRepository.updateProfile remains.

DROP TRIGGER IF EXISTS author_profiles_role_guard ON public.author_profiles;
DROP TRIGGER IF EXISTS publisher_profiles_role_guard ON public.publisher_profiles;
DROP TRIGGER IF EXISTS admin_profiles_role_guard ON public.admin_profiles;

DROP FUNCTION IF EXISTS public.ensure_profile_role_match() CASCADE;
