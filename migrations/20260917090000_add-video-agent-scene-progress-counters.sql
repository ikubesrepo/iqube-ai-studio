-- Lets the frontend show real "X of Y scenes done" progress and a growing
-- preview instead of waiting for the whole scene batch to finish. Each
-- scene subtask increments scenes_completed and (best-effort) rewrites
-- composition_data with whatever contiguous gap-free prefix of scenes is
-- done so far; the parent task's own final write after the batch resolves
-- remains the authoritative source of truth.
ALTER TABLE public.video_agent_projects ADD COLUMN scenes_total integer;
ALTER TABLE public.video_agent_projects ADD COLUMN scenes_completed integer NOT NULL DEFAULT 0;
