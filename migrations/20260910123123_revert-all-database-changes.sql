-- Revert custom database setup that broke signup.
--
-- Risk note (flagged in review): on_auth_user_created is a trigger a prior
-- session attached to auth.users -- itself a system-owned table, NOT part of
-- InsForge's own core auth internals/upgrade path. Its INSERT into
-- public.users could fail and take down the whole auth.users insert
-- transaction, which is exactly what broke Google OAuth signup earlier today.
--
-- We could not DROP the trigger itself: our project's CLI/API role
-- (project_admin) is not the owner of auth.users (role 'postgres'), so
-- `DROP TRIGGER ... ON auth.users` fails with "must be owner of relation
-- users", and `--unrestricted` SQL execution is disabled on this project.
-- Filed as InsForge feedback (id a0dd6c7b-037b-4c4d-9829-0b02a00938fb) asking
-- for a supported, ownership-safe way to remove a trigger like this.
--
-- Workaround: leave the trigger attached, but replace the function we DO own
-- with a no-op, so it fires on every future auth.users insert and does
-- nothing. This is safe today because the app no longer relies on any DB
-- trigger for post-signup logic -- see lib/auth/record-login.ts, which
-- upserts public.users from application code (Server Actions / Route
-- Handlers) after InsForge confirms auth succeeded, entirely independent of
-- this trigger. If InsForge ever exposes a way to fully drop it, do so and
-- delete this no-op function along with it.
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
