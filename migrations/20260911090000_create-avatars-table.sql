-- Avatars: user-uploaded or AI-generated (Gemini) avatar records.
-- Written only from application code (server actions + the generate-avatar
-- Trigger.dev task via the InsForge admin client) -- never from a trigger on
-- auth.users, per the earlier signup-outage lesson.
CREATE TABLE public.avatars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('upload', 'ai', 'default')),
  style text CHECK (style IN ('podcast', 'casual', '3d_cartoon', 'stylized')),
  prompt text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  trigger_run_id text,
  source_image_url text,
  source_image_key text,
  crop_16_9_url text,
  crop_16_9_key text,
  crop_9_16_url text,
  crop_9_16_key text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.avatars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_user_can_crud_own_avatars" ON public.avatars
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_avatars_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_avatars_updated_at_trigger
  BEFORE UPDATE ON public.avatars
  FOR EACH ROW
  EXECUTE FUNCTION public.update_avatars_updated_at();
