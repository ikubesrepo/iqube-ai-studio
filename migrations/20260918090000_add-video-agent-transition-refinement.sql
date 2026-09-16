-- Lets a user steer a "Regenerate" attempt: refinement_notes feeds the
-- scene-planner LLM prompt, transition_style controls the crossfade in
-- remotion/VideoAgentComposition.tsx (both the Player preview and the
-- server-side render read the same composition_data, built from this row).
ALTER TABLE public.video_agent_projects ADD COLUMN transition_style text NOT NULL DEFAULT 'crossfade'
  CHECK (transition_style IN ('crossfade', 'hard_cut', 'none'));
ALTER TABLE public.video_agent_projects ADD COLUMN refinement_notes text;
