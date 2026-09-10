-- Revert custom database setup that broke signup.
-- The on_auth_user_created trigger on auth.users (owned by the system role)
-- could not be dropped directly (insufficient privilege), so its function was
-- neutralized to a no-op instead -- the trigger still fires but does nothing.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.save_user(uuid, text, text);
DROP FUNCTION IF EXISTS public.update_last_login(uuid);
DROP FUNCTION IF EXISTS public.update_users_updated_at() CASCADE;
DROP TABLE IF EXISTS public.users;
