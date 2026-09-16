-- AI Video Agent: multi-scene generated videos (avatar clips + B-roll +
-- voiceover + captions + Remotion composition). Written only from
-- application code (server actions + the generate-video-agent /
-- generate-video-agent-scene Trigger.dev tasks via the InsForge admin
-- client) -- never from a trigger on auth.users, per the earlier
-- signup-outage lesson.
--
-- Scenes are kept in their own table (not a JSONB array on the project
-- row) specifically so concurrent per-scene B-roll generation (fanned out
-- via Trigger.dev batchTriggerAndWait) can update rows independently
-- without a read-modify-write race on a shared JSON column.
CREATE TABLE public.video_agent_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  avatar_id uuid REFERENCES public.avatars(id) ON DELETE SET NULL,
  voice_clone_id uuid REFERENCES public.voice_clones(id) ON DELETE SET NULL,
  default_voice_id text,
  avatar_label text NOT NULL,
  voice_label text NOT NULL,
  title text NOT NULL,
  script_source text NOT NULL CHECK (script_source IN ('manual', 'ai_topic')),
  topic text,
  script text NOT NULL CHECK (char_length(script) <= 20000),
  duration_seconds integer NOT NULL CHECK (duration_seconds IN (30, 60, 90, 120)),
  aspect_ratio text NOT NULL CHECK (aspect_ratio IN ('16:9', '9:16')),
  caption_style text NOT NULL CHECK (caption_style IN ('bold_subtitle', 'minimal_clean', 'podcast', 'tiktok_viral', 'gradient_highlight', 'word_by_word')),
  b_roll_style text NOT NULL CHECK (b_roll_style IN ('ai_image', 'stock', 'ai_video', 'ai_illustration')),
  credits_charged integer NOT NULL CHECK (credits_charged >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  trigger_run_id text,
  narration_audio_url text,
  narration_audio_key text,
  captions_data jsonb,
  composition_data jsonb,
  video_url text,
  video_key text,
  thumbnail_url text,
  thumbnail_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.video_agent_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.video_agent_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene_index integer NOT NULL CHECK (scene_index >= 0),
  title text NOT NULL,
  summary text,
  start_time numeric NOT NULL CHECK (start_time >= 0),
  end_time numeric NOT NULL CHECK (end_time > start_time),
  voiceover_segment text NOT NULL,
  caption_text text NOT NULL,
  has_b_roll boolean NOT NULL DEFAULT true,
  visual_prompt text,
  has_avatar_clip boolean NOT NULL DEFAULT false,
  avatar_clip_url text,
  avatar_clip_key text,
  b_roll_type text CHECK (b_roll_type IN ('ai_image', 'stock_image', 'stock_video', 'ai_video', 'ai_illustration')),
  b_roll_url text,
  b_roll_key text,
  illustration_data jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, scene_index)
);

ALTER TABLE public.video_agent_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_agent_scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_user_can_crud_own_video_agent_projects" ON public.video_agent_projects
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "authenticated_user_can_crud_own_video_agent_scenes" ON public.video_agent_scenes
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_video_agent_projects_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_video_agent_projects_updated_at_trigger
  BEFORE UPDATE ON public.video_agent_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_video_agent_projects_updated_at();

CREATE OR REPLACE FUNCTION public.update_video_agent_scenes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_video_agent_scenes_updated_at_trigger
  BEFORE UPDATE ON public.video_agent_scenes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_video_agent_scenes_updated_at();
