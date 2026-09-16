// Shared between server-side generation (src/trigger/generate-video-agent.ts)
// and the composition (VideoAgentComposition.tsx) so both agree on how long
// an avatar clip's window is -- matches DOMOAI_MAX_CLIP_SECONDS
// (lib/dashboard/video-avatars/domoai.ts), so a single avatar clip needs no
// chunking/stitching on the DomoAI path.
export const AVATAR_CLIP_SECONDS = 3;

export type CaptionWord = { word: string; start: number; end: number };

export type CaptionCue = {
  text: string;
  start: number;
  end: number;
  words?: CaptionWord[];
};

export type SceneBRollType = "ai_image" | "stock_image" | "stock_video" | "ai_video" | "ai_illustration";

export type SceneData = {
  id: string;
  index: number;
  startTime: number;
  endTime: number;
  hasAvatarClip: boolean;
  avatarClipUrl?: string | null;
  bRollType?: SceneBRollType | null;
  bRollUrl?: string | null;
  // For bRollType "ai_illustration": TSX source of a self-contained React
  // component (named `Scene`, no imports), generated per-scene and compiled
  // at render time -- see remotion/dynamic-illustration.ts.
  illustrationCode?: string | null;
};

export type CaptionStyleId =
  | "bold_subtitle"
  | "minimal_clean"
  | "podcast"
  | "tiktok_viral"
  | "gradient_highlight"
  | "word_by_word";

export type TransitionStyleId = "crossfade" | "hard_cut" | "none";

/**
 * The exact serializable shape stored as `composition_data` jsonb on
 * `video_agent_projects` -- built once by
 * lib/dashboard/video-agent/composition-builder.ts, then consumed
 * identically by @remotion/player (browser preview) and the server-side
 * @remotion/renderer render step, so both stay in lockstep by construction.
 */
export type VideoAgentCompositionProps = {
  aspectRatio: "16:9" | "9:16";
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  narrationAudioUrl: string;
  captionStyle: CaptionStyleId;
  captions: CaptionCue[];
  scenes: SceneData[];
  transitionStyle: TransitionStyleId;
};
