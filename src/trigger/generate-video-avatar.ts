import { task, metadata } from "@trigger.dev/sdk";
import { z } from "zod";

import { createInsforgeAdminClient } from "@/lib/insforge/admin";
import { extractThumbnailFromVideoBuffer } from "@/lib/dashboard/video-avatars/thumbnail";
import { generateTalkingAvatarVideo } from "@/lib/dashboard/video-avatars/talking-avatar";
import { synthesizeNarration } from "@/lib/dashboard/video-avatars/narration";

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

export const generateVideoAvatarTask = task({
  id: "generate-video-avatar",
  maxDuration: 900,
  run: async (rawPayload: GenerateVideoAvatarPayload) => {
    const payload = payloadSchema.parse(rawPayload);
    const client = createInsforgeAdminClient();

    await client.database.from("avatar_videos").update({ status: "processing" }).eq("id", payload.avatarVideoId);

    try {
      metadata.set("progress", { step: STEPS.preparingAvatar, percentage: 5 });

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

      // Provider fallback (DomoAI primary, SadTalker via Replicate if it
      // fails) and DomoAI's 3s-per-request chunking/stitching both live in
      // lib/dashboard/video-avatars/talking-avatar.ts -- progress can't be
      // reported mid-call across that provider boundary, so this jumps
      // straight from 40% to 85% once it resolves.
      const videoBuffer = await generateTalkingAvatarVideo({
        avatarImageUrl: payload.avatarImageUrl,
        narrationMp3,
        aspectRatio: payload.aspectRatio,
      });

      // Save the video as soon as it exists, before the thumbnail step --
      // generateTalkingAvatarVideo is the expensive, paid-for call
      // (DomoAI/SadTalker). A thumbnail-extraction/upload failure
      // afterward must not throw away an already-successful video.
      metadata.set("progress", { step: STEPS.uploading, percentage: 85 });
      const videoPath = `videos/${payload.avatarVideoId}.mp4`;
      const { data: videoUpload, error: videoError } = await client.storage
        .from("avatar-videos")
        .upload(videoPath, new Blob([new Uint8Array(videoBuffer)], { type: "video/mp4" }));

      if (videoError || !videoUpload) {
        throw new Error(videoError?.message || "Failed to upload generated video");
      }

      await client.database
        .from("avatar_videos")
        .update({ status: "completed", video_url: videoUpload.url, video_key: videoUpload.key })
        .eq("id", payload.avatarVideoId);

      // Best-effort from here on: the video is already saved, so a
      // thumbnail failure is logged and skipped rather than failing the
      // whole (already-successful) generation.
      metadata.set("progress", { step: STEPS.processingOutput, percentage: 95 });
      try {
        const thumbnailBuffer = await extractThumbnailFromVideoBuffer(videoBuffer);
        const thumbnailPath = `thumbnails/${payload.avatarVideoId}.jpg`;
        const { data: thumbnailUpload, error: thumbnailError } = await client.storage
          .from("avatar-videos")
          .upload(thumbnailPath, new Blob([new Uint8Array(thumbnailBuffer)], { type: "image/jpeg" }));

        if (thumbnailError || !thumbnailUpload) {
          throw new Error(thumbnailError?.message || "Failed to upload video thumbnail");
        }

        await client.database
          .from("avatar_videos")
          .update({ thumbnail_url: thumbnailUpload.url, thumbnail_key: thumbnailUpload.key })
          .eq("id", payload.avatarVideoId);
      } catch (thumbnailErr) {
        console.warn(
          `Thumbnail generation failed for avatar video ${payload.avatarVideoId}; video is still saved.`,
          thumbnailErr,
        );
      }

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
