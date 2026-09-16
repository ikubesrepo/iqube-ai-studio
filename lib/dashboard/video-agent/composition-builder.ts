import "server-only";

import type { CaptionCue, SceneBRollType, VideoAgentCompositionProps } from "@/remotion/types";

const FPS = 30;

type ProjectRow = {
  aspect_ratio: "16:9" | "9:16";
  duration_seconds: number;
  narration_audio_url: string;
  caption_style: VideoAgentCompositionProps["captionStyle"];
  captions_data: CaptionCue[] | null;
  transition_style: VideoAgentCompositionProps["transitionStyle"];
};

type SceneRow = {
  id: string;
  scene_index: number;
  start_time: number;
  end_time: number;
  has_avatar_clip: boolean;
  avatar_clip_url: string | null;
  avatar_clip_duration_seconds: number | null;
  b_roll_type: SceneBRollType | null;
  b_roll_url: string | null;
  illustration_data: { code?: string } | null;
};

const DIMENSIONS: Record<"16:9" | "9:16", { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

/**
 * The single place that turns DB rows into composition_data jsonb -- both
 * the client Remotion Player and the server-side renderer consume this
 * exact shape, so they stay in lockstep by construction.
 *
 * Duration is derived from the scenes' actual (voice-aligned) end times,
 * not project.duration_seconds -- scene timing is re-synced to the real
 * generated voiceover (see lib/dashboard/video-agent/scene-timing.ts), so
 * the true video length can drift slightly from the user's selected
 * duration depending on how fast the synthesized voice actually speaks.
 * project.duration_seconds is kept only as the originally requested value,
 * for display/credit purposes.
 */
export function buildCompositionData(project: ProjectRow, scenes: SceneRow[]): VideoAgentCompositionProps {
  const dimensions = DIMENSIONS[project.aspect_ratio];
  const sorted = [...scenes].sort((a, b) => a.scene_index - b.scene_index);
  const actualDurationSeconds =
    sorted.length > 0 ? Math.max(...sorted.map((scene) => scene.end_time)) : project.duration_seconds;

  return {
    aspectRatio: project.aspect_ratio,
    durationInFrames: Math.round(actualDurationSeconds * FPS),
    fps: FPS,
    width: dimensions.width,
    height: dimensions.height,
    narrationAudioUrl: project.narration_audio_url,
    captionStyle: project.caption_style,
    captions: project.captions_data ?? [],
    transitionStyle: project.transition_style,
    scenes: sorted.map((scene) => ({
      id: scene.id,
      index: scene.scene_index,
      startTime: scene.start_time,
      endTime: scene.end_time,
      hasAvatarClip: scene.has_avatar_clip,
      avatarClipUrl: scene.avatar_clip_url,
      avatarClipDurationSeconds: scene.avatar_clip_duration_seconds ?? undefined,
      bRollType: scene.b_roll_type,
      bRollUrl: scene.b_roll_url,
      illustrationCode: scene.illustration_data?.code ?? null,
    })),
  };
}
