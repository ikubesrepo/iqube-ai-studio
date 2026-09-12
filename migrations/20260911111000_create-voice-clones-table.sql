-- User-created voice clones (Replicate resemble-ai/chatterbox). Default
-- Deepgram voices are NOT stored here -- they are static config in
-- lib/dashboard/voice-cloning/default-voices.ts, with cached previews in
-- default_voice_previews below. Written only from server actions (insert
-- pending row) and the clone-voice Trigger.dev task via the InsForge admin
-- client -- never from a trigger on auth.users.
--
-- Unlike avatars, a failed clone is DELETED by the task rather than kept
-- with status:'failed' (product requirement) -- the 'failed' status value
-- only exists transiently between the task's catch block and its delete call.
CREATE TABLE public.voice_clones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  trigger_run_id text,
  sample_audio_url text,
  sample_audio_key text,
  cloned_audio_url text,
  cloned_audio_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.voice_clones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_user_can_crud_own_voice_clones" ON public.voice_clones
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_voice_clones_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_voice_clones_updated_at_trigger
  BEFORE UPDATE ON public.voice_clones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_voice_clones_updated_at();

-- Cached Deepgram Aura preview audio for the built-in default voices shown
-- alongside custom voice clones. One row per Deepgram voice model id.
-- Generated on first request by a server action using DEEPGRAM_API_KEY,
-- then reused. Public-read (not user data); writes only via the admin client.
CREATE TABLE public.default_voice_previews (
  voice_model_id text PRIMARY KEY,
  preview_audio_url text NOT NULL,
  preview_audio_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.default_voice_previews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_authenticated_can_read_default_voice_previews" ON public.default_voice_previews
  FOR SELECT
  USING (true);
