export const DURATION_OPTIONS = [30, 60, 90, 120] as const;
export type VideoAgentDurationSeconds = (typeof DURATION_OPTIONS)[number];

export function isVideoAgentDuration(value: unknown): value is VideoAgentDurationSeconds {
  return typeof value === "number" && (DURATION_OPTIONS as readonly number[]).includes(value);
}

export const B_ROLL_STYLES = ["ai_image", "stock", "ai_video", "ai_illustration"] as const;
export type BRollStyle = (typeof B_ROLL_STYLES)[number];

export function isBRollStyle(value: unknown): value is BRollStyle {
  return typeof value === "string" && (B_ROLL_STYLES as readonly string[]).includes(value);
}

export const B_ROLL_STYLE_INFO: Record<BRollStyle, { label: string; description: string; creditsPerScene: number }> = {
  ai_image: {
    label: "AI Generated Images",
    description: "High-quality images generated from the script and scene prompts.",
    creditsPerScene: 5,
  },
  stock: {
    label: "Stock Images/Videos",
    description: "Free stock photos and clips fetched from Pixabay based on scene keywords.",
    creditsPerScene: 0,
  },
  ai_video: {
    label: "AI Generated Video",
    description: "Short AI-generated video clips for each scene.",
    creditsPerScene: 10,
  },
  ai_illustration: {
    label: "AI Illustration Animated Video",
    description: "Animated illustration-style scenes composed directly in Remotion.",
    creditsPerScene: 7,
  },
};

// Real scene count is only known once the task's structured Gemini
// scene-breakdown call runs -- this is a client/pre-generation-safe
// estimate only, deliberately rounded up so credits are never
// under-charged relative to what the task actually generates.
const TARGET_SCENE_SECONDS = 7.5;

export function estimateSceneCount(durationSeconds: VideoAgentDurationSeconds): number {
  return Math.ceil(durationSeconds / TARGET_SCENE_SECONDS);
}

export function estimateVideoAgentCreditsCost(durationSeconds: VideoAgentDurationSeconds, bRollStyle: BRollStyle): number {
  const sceneCount = estimateSceneCount(durationSeconds);
  return sceneCount * B_ROLL_STYLE_INFO[bRollStyle].creditsPerScene;
}
