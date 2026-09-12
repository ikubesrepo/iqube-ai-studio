import { task, metadata } from "@trigger.dev/sdk";
import { z } from "zod";
import Replicate from "replicate";

import { createInsforgeAdminClient } from "@/lib/insforge/admin";
import { convertBufferToWav, convertWavBufferToMp3, fetchUrlToBuffer } from "@/lib/dashboard/voice-cloning/audio";
import { withReplicateRetry } from "@/lib/dashboard/voice-cloning/replicate";
import { submitTalkingAvatarTask, pollTaskUntilTerminal } from "@/lib/dashboard/video-avatars/domoai";
import { extractThumbnailFromVideoBuffer } from "@/lib/dashboard/video-avatars/thumbnail";
import { synthesizeDeepgramSpeech } from "@/lib/dashboard/video-avatars/deepgram-tts";

const payloadSchema = z.object({
  avatarVideoId: z.string(),
  userId: z.string(),
  script: z.string(),
  avatarImageUrl: z.string(),
  voiceCloneAudioUrl: z.string().optional(),
  defaultVoiceModelId: z.string().optional(),
  aspectRatio: z.enum(["16:9", "9:16"]),
  durationSeconds: z.number(),
  creditsCharged: z.number(),
});

type GenerateVideoAvatarPayload = z.infer<typeof payloadSchema>;

// These step labels are read verbatim by the create-video-avatar-form's
// progress panel (STEP_LABELS in components/dashboard/video-avatars) to
// determine which step is done/current/pending -- keep them byte-identical.
const STEPS = {
  preparingAvatar: "Preparing avatar",
  preparingVoice: "Preparing voice",
  generatingVideo: "Generating video",
  processingOutput: "Processing output",
  uploading: "Uploading to storage",
  completed: "Completed",
} as const;

async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch source image: ${response.status}`);
  }

  const mimeType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());

  return { data: buffer.toString("base64"), mimeType };
}

async function synthesizeNarration(
  script: string,
  voice: { voiceCloneAudioUrl?: string; defaultVoiceModelId?: string },
): Promise<Buffer> {
  if (voice.defaultVoiceModelId) {
    return synthesizeDeepgramSpeech(voice.defaultVoiceModelId, script);
  }

  if (!voice.voiceCloneAudioUrl) {
    throw new Error("No voice reference provided");
  }

  const referenceBuffer = await fetchUrlToBuffer(voice.voiceCloneAudioUrl);
  const referenceWavBuffer = await convertBufferToWav(referenceBuffer);

  const replicate = new Replicate();
  const output = await withReplicateRetry(() =>
    replicate.run("resemble-ai/chatterbox", {
      input: {
        prompt: script,
        audio_prompt: referenceWavBuffer,
      },
    }),
  );

  const wavBuffer = await fetchOutputBuffer(output);
  return convertWavBufferToMp3(wavBuffer);
}

async function fetchOutputBuffer(output: unknown): Promise<Buffer> {
  if (output && typeof output === "object" && "url" in output && typeof (output as { url: () => URL | string }).url === "function") {
    const url = (output as { url: () => URL | string }).url();
    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`Failed to fetch Replicate output: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  if (typeof output === "string") {
    const response = await fetch(output);

    if (!response.ok) {
      throw new Error(`Failed to fetch Replicate output: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  throw new Error("Unexpected Replicate output shape");
}

export const generateVideoAvatarTask = task({
  id: "generate-video-avatar",
  maxDuration: 900,
  run: async (rawPayload: GenerateVideoAvatarPayload) => {
    const payload = payloadSchema.parse(rawPayload);
    const client = createInsforgeAdminClient();

    await client.database.from("avatar_videos").update({ status: "processing" }).eq("id", payload.avatarVideoId);

    try {
      metadata.set("progress", { step: STEPS.preparingAvatar, percentage: 5 });
      const avatarImage = await fetchAsBase64(payload.avatarImageUrl);

      metadata.set("progress", { step: STEPS.preparingVoice, percentage: 20 });
      const narrationMp3 = await synthesizeNarration(payload.script, {
        voiceCloneAudioUrl: payload.voiceCloneAudioUrl,
        defaultVoiceModelId: payload.defaultVoiceModelId,
      });

      const narrationPath = `narration/${payload.avatarVideoId}.mp3`;
      const { data: narrationUpload, error: narrationError } = await client.storage
        .from("avatar-videos")
        .upload(narrationPath, new Blob([new Uint8Array(narrationMp3)], { type: "audio/mpeg" }));

      if (narrationError || !narrationUpload) {
        throw new Error(narrationError?.message || "Failed to upload narration audio");
      }

      await client.database
        .from("avatar_videos")
        .update({ narration_audio_url: narrationUpload.url, narration_audio_key: narrationUpload.key })
        .eq("id", payload.avatarVideoId);

      metadata.set("progress", { step: STEPS.generatingVideo, percentage: 40 });
      const { taskId } = await submitTalkingAvatarTask({
        imageBase64: avatarImage.data,
        audioBase64: narrationMp3.toString("base64"),
        seconds: payload.durationSeconds,
        aspectRatio: payload.aspectRatio,
      });

      await client.database.from("avatar_videos").update({ domoai_task_id: taskId }).eq("id", payload.avatarVideoId);

      let pollCount = 0;
      const video = await pollTaskUntilTerminal(taskId, {
        onPoll: () => {
          pollCount++;
          const percentage = Math.min(75, 40 + pollCount * 3);
          metadata.set("progress", { step: STEPS.generatingVideo, percentage });
        },
      });

      metadata.set("progress", { step: STEPS.processingOutput, percentage: 85 });
      const videoBuffer = await fetchUrlToBuffer(video.url);
      const thumbnailBuffer = await extractThumbnailFromVideoBuffer(videoBuffer);

      metadata.set("progress", { step: STEPS.uploading, percentage: 95 });
      const videoPath = `videos/${payload.avatarVideoId}.mp4`;
      const { data: videoUpload, error: videoError } = await client.storage
        .from("avatar-videos")
        .upload(videoPath, new Blob([new Uint8Array(videoBuffer)], { type: "video/mp4" }));

      if (videoError || !videoUpload) {
        throw new Error(videoError?.message || "Failed to upload generated video");
      }

      const thumbnailPath = `thumbnails/${payload.avatarVideoId}.jpg`;
      const { data: thumbnailUpload, error: thumbnailError } = await client.storage
        .from("avatar-videos")
        .upload(thumbnailPath, new Blob([new Uint8Array(thumbnailBuffer)], { type: "image/jpeg" }));

      if (thumbnailError || !thumbnailUpload) {
        throw new Error(thumbnailError?.message || "Failed to upload video thumbnail");
      }

      await client.database
        .from("avatar_videos")
        .update({
          status: "completed",
          video_url: videoUpload.url,
          video_key: videoUpload.key,
          thumbnail_url: thumbnailUpload.url,
          thumbnail_key: thumbnailUpload.key,
        })
        .eq("id", payload.avatarVideoId);

      metadata.set("progress", { step: STEPS.completed, percentage: 100 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      metadata.set("error", message);
      // Refund + status update happen in onFailure (below), which only runs
      // once all of Trigger.dev's automatic retries are exhausted --
      // refunding here would over-refund by one charge per failed attempt.
      throw err;
    }
  },
  onFailure: async ({ payload: rawPayload, error }) => {
    const payload = payloadSchema.parse(rawPayload);
    const client = createInsforgeAdminClient();
    const message = error instanceof Error ? error.message : "Generation failed";

    await client.database.rpc("refund_credits", { p_user_id: payload.userId, p_amount: payload.creditsCharged });

    await client.database
      .from("avatar_videos")
      .update({ status: "failed", error_message: message })
      .eq("id", payload.avatarVideoId);
  },
});
