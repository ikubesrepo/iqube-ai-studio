-- Splits video generation into a cheap "prepare" phase (script -> scenes ->
-- narration -> captions -> per-scene assets -> composition_data) and a
-- separately user-confirmed "render" phase (the expensive server-side
-- Remotion renderMedia() call). "awaiting_render" means composition_data is
-- ready and a live Player preview can be shown, but no full render has been
-- paid for in compute time yet -- the user must explicitly confirm via
-- renderVideoAgentAction before that happens.
ALTER TABLE public.video_agent_projects DROP CONSTRAINT video_agent_projects_status_check;
ALTER TABLE public.video_agent_projects ADD CONSTRAINT video_agent_projects_status_check
  CHECK (status IN ('pending', 'processing', 'awaiting_render', 'completed', 'failed'));

-- Prepare-phase and render-phase now run as two independent Trigger.dev
-- task runs; keep both run ids so a project interrupted mid-prepare or
-- mid-render can still be traced back to the right run from the library.
ALTER TABLE public.video_agent_projects ADD COLUMN render_trigger_run_id text;
