-- Generated TTS audio results for the "Voice Cloning TTS" tab. References
-- either a custom voice_clones row or a default Deepgram voice (by static
-- model id, since defaults aren't DB rows). Written only from the
-- generate-tts server action (insert pending row) and the
-- generate-voice-tts Trigger.dev task via the InsForge admin client.
--
-- Unlike voice cloning, a failed generation KEEPS its row (status:'failed'
-- + error_message) so the user can see what happened, and the deducted
-- credits are refunded via public.refund_credits().
CREATE TABLE public.tts_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  voice_clone_id uuid REFERENCES public.voice_clones(id) ON DELETE SET NULL,
  default_voice_id text,
  voice_label text NOT NULL,
  input_text text NOT NULL CHECK (char_length(input_text) <= 2000),
  credits_charged integer NOT NULL CHECK (credits_charged >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  trigger_run_id text,
  audio_url text,
  audio_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voice_reference_present CHECK (voice_clone_id IS NOT NULL OR default_voice_id IS NOT NULL)
);

ALTER TABLE public.tts_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_user_can_crud_own_tts_generations" ON public.tts_generations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_tts_generations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_tts_generations_updated_at_trigger
  BEFORE UPDATE ON public.tts_generations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tts_generations_updated_at();
