import "server-only";

import Replicate from "replicate";

import { fetchUrlToBuffer } from "@/lib/dashboard/voice-cloning/audio";
import { withReplicateRetry } from "@/lib/dashboard/voice-cloning/replicate";

// lucataco/sadtalker has no "default"/version-less API route -- calling it
// as just "owner/name" 404s. Pinned to its latest version (confirmed live
// against https://api.replicate.com/v1/models/lucataco/sadtalker).
const SADTALKER_MODEL = "lucataco/sadtalker:85c698db7c0a66d5011435d0191db323034e1da04b912a6d365833141b6a285b" as const;

async function fetchReplicateOutputBuffer(output: unknown): Promise<Buffer> {
  if (output && typeof output === "object" && "url" in output && typeof (output as { url: () => URL | string }).url === "function") {
    const url = (output as { url: () => URL | string }).url();
    return fetchUrlToBuffer(url.toString());
  }

  if (typeof output === "string") {
    return fetchUrlToBuffer(output);
  }

  throw new Error("Unexpected Replicate output shape");
}

/**
 * Fallback talking-avatar provider (Replicate-hosted SadTalker) used by
 * lib/dashboard/video-avatars/talking-avatar.ts when DomoAI fails. Unlike
 * DomoAI, SadTalker has no per-request duration cap -- it generates a video
 * matching the full driven-audio length in one call, so no chunking is
 * needed here. It also takes the avatar image directly as a URL (no
 * base64/upload step) and the narration audio as an inline data URI.
 */
export async function generateSadTalkerTalkingAvatarVideo(input: {
  avatarImageUrl: string;
  narrationMp3: Buffer;
}): Promise<Buffer> {
  const replicate = new Replicate();

  const output = await withReplicateRetry(() =>
    replicate.run(SADTALKER_MODEL, {
      input: {
        source_image: input.avatarImageUrl,
        driven_audio: `data:audio/mpeg;base64,${input.narrationMp3.toString("base64")}`,
      },
    }),
  );

  return fetchReplicateOutputBuffer(output);
}
