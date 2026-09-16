import "server-only";

import { generateDomoaiTalkingAvatarVideo } from "@/lib/dashboard/video-avatars/domoai";
import { generateSadTalkerTalkingAvatarVideo } from "@/lib/dashboard/video-avatars/sadtalker";

/**
 * Single entry point both talking-avatar Trigger.dev tasks call. DomoAI is
 * the primary provider; any failure (rate limit, quota, validation error,
 * etc.) falls back to a Replicate-hosted SadTalker model, since DomoAI has
 * proven unreliable (a hard daily task-limit quota, among other live
 * issues). The fallback is intentionally broad -- any DomoAI error, not
 * just quota-specific ones -- to maximize resilience while DomoAI's
 * behavior is still being verified.
 */
export async function generateTalkingAvatarVideo(input: {
  avatarImageUrl: string;
  narrationMp3: Buffer;
  aspectRatio: "16:9" | "9:16";
}): Promise<Buffer> {
  try {
    return await generateDomoaiTalkingAvatarVideo(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`DomoAI talking-avatar generation failed (${message}); falling back to SadTalker.`);
    return await generateSadTalkerTalkingAvatarVideo(input);
  }
}
