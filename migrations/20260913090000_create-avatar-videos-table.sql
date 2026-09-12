-- AI Video Avatars: talking-avatar videos generated from an avatar image +
-- a voice (cloned or default) + a script, via DomoAI. Written only from
-- application code (server actions + the generate-video-avatar Trigger.dev
-- task via the InsForge admin client) -- never from a trigger on
-- auth.users, per the earlier signup-outage lesson.
--
-- avatar_id / voice_clone_id are ON DELETE SET NULL with denormalized
-- avatar_label / voice_label captured at creation time, so deleting a
-- source avatar or voice clone later never breaks this table (same lesson
-- as the tts_generations voice-reference CHECK constraint that had to be
-- dropped later -- see 20260912130000_drop-tts-generations-voice-reference-check.sql).
-- "Exactly one of voice_clone_id / default_voice_id" is enforced in the
-- server action only, not as a CHECK constraint, for the same reason.
CREATE TABLE public.avatar_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_id uuid REFERENCES public.avatars(id) ON DELETE SET NULL,
  voice_clone_id uuid REFERENCES public.voice_clones(id) ON DELETE SET NULL,
  default_voice_id text,
  avatar_label text NOT NULL,
  voice_label text NOT NULL,
  title text,
  script text NOT NULL CHECK (char_length(script) <= 4000),
  tone text CHECK (tone IN ('professional', 'friendly', 'energetic', 'educational', 'promotional')),
  aspect_ratio text NOT NULL CHECK (aspect_ratio IN ('16:9', '9:16')),
  duration_seconds integer NOT NULL CHECK (duration_seconds IN (5, 10, 20, 30, 60)),
  credits_charged integer NOT NULL CHECK (credits_charged >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  trigger_run_id text,
  domoai_task_id text,
  narration_audio_url text,
  narration_audio_key text,
  video_url text,
  video_key text,
  thumbnail_url text,
  thumbnail_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.avatar_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_user_can_crud_own_avatar_videos" ON public.avatar_videos
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_avatar_videos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_avatar_videos_updated_at_trigger
  BEFORE UPDATE ON public.avatar_videos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_avatar_videos_updated_at();
