-- Tracks which specific crop (16:9 or 9:16) is "in use" for the active
-- avatar, chosen independently per ratio via a radio-style selector on each
-- thumbnail. Null means unspecified (e.g. only one crop exists, or a
-- preference hasn't been made yet).
ALTER TABLE public.avatars
  ADD COLUMN preferred_ratio text CHECK (preferred_ratio IN ('16:9', '9:16'));
