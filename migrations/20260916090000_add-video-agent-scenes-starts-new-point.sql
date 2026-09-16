-- Bug fix: avatar-clip placement was duration-based (a fixed count of
-- evenly-spaced timestamps regardless of script content, see the now
-- removed lib/dashboard/video-agent/avatar-clip-placement.ts). It is now
-- content-based: the scene-planning LLM (scene-planner.ts) flags which
-- scenes open a genuinely new point vs. continue the previous one, and
-- generate-video-agent.ts places a short avatar appearance at the start of
-- every new-point scene. No forced placement on any particular scene --
-- purely content-driven, per product direction.
ALTER TABLE public.video_agent_scenes ADD COLUMN starts_new_point boolean NOT NULL DEFAULT false;
