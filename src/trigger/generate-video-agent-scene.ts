import { task, heartbeats } from "@trigger.dev/sdk";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import Replicate from "replicate";

import { createInsforgeAdminClient } from "@/lib/insforge/admin";
import { extractAudioSlice, fetchUrlToBuffer } from "@/lib/dashboard/voice-cloning/audio";
import { withReplicateRetry } from "@/lib/dashboard/voice-cloning/replicate";
import { generateTalkingAvatarVideo } from "@/lib/dashboard/video-avatars/talking-avatar";
import { buildCompositionData } from "@/lib/dashboard/video-agent/composition-builder";
import { searchPixabayImage, searchPixabayVideo } from "@/lib/dashboard/video-agent/pixabay";
import { generateIllustrationComponentCode } from "@/lib/dashboard/video-agent/illustration-codegen";

const payloadSchema = z.object({
  sceneId: z.string(),
  projectId: z.string(),
  bRollStyle: z.enum(["ai_image", "stock", "ai_video", "ai_illustration"]),
  visualPrompt: z.string(),
  aspectRatio: z.enum(["16:9", "9:16"]),
  sceneDurationSeconds: z.number(),
  needsBRoll: z.boolean(),
  hasAvatarClip: z.boolean(),
  avatarClipSeconds: z.number(),
  avatarImageUrl: z.string().optional(),
  narrationAudioUrl: z.string().optional(),
  avatarClipStartSeconds: z.number().optional(),
  avatarClipEndSeconds: z.number().optional(),
});

type Payload = z.infer<typeof payloadSchema>;

async function fetchReplicateOutputBuffer(output: unknown): Promise<Buffer> {
  if (output && typeof output === "object" && "url" in output && typeof (output as { url: () => URL | string }).url === "function") {
    const url = (output as { url: () => URL | string }).url();
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Failed to fetch Replicate output: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  if (typeof output === "string") {
    const response = await fetch(output);
    if (!response.ok) throw new Error(`Failed to fetch Replicate output: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  throw new Error("Unexpected Replicate output shape");
}

async function generateAvatarClip(client: ReturnType<typeof createInsforgeAdminClient>, payload: Payload) {
  if (
    !payload.avatarImageUrl ||
    !payload.narrationAudioUrl ||
    payload.avatarClipStartSeconds === undefined ||
    payload.avatarClipEndSeconds === undefined
  ) {
    throw new Error("Missing avatar image or narration slice bounds for avatar clip");
  }

  // Slice the exact matching segment out of the already-synthesized master
  // narration (rather than re-synthesizing a second, independent TTS
  // render of a truncated text guess) -- this is what the avatar's lips
  // are driven from, so it stays byte-identical to what plays continuously
  // in the final composition. See AvatarClipLayer.tsx (muted) and
  // VoiceoverAudio.tsx (the one continuous track that actually plays).
  const masterNarrationBuffer = await fetchUrlToBuffer(payload.narrationAudioUrl);
  const narrationMp3 = await extractAudioSlice(masterNarrationBuffer, payload.avatarClipStartSeconds, payload.avatarClipEndSeconds);

  await heartbeats.yield();

  // Provider fallback (DomoAI primary, SadTalker via Replicate if it
  // fails) and DomoAI's 3s-per-request chunking/stitching both live in
  // lib/dashboard/video-avatars/talking-avatar.ts.
  const videoBuffer = await generateTalkingAvatarVideo({
    avatarImageUrl: payload.avatarImageUrl,
    narrationMp3,
    aspectRatio: payload.aspectRatio,
  });

  await heartbeats.yield();

  const path = `avatar-clips/${payload.projectId}/${payload.sceneId}.mp4`;
  const { data: upload, error } = await client.storage
    .from("video-agent")
    .upload(path, new Blob([new Uint8Array(videoBuffer)], { type: "video/mp4" }));

  if (error || !upload) {
    throw new Error(error?.message || "Failed to upload avatar clip");
  }

  return { url: upload.url, key: upload.key };
}

async function generateAiImageBRoll(client: ReturnType<typeof createInsforgeAdminClient>, payload: Payload) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini is not configured yet.");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-image",
    contents: [{ text: payload.visualPrompt }],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: payload.aspectRatio },
    },
  });

  const base64 = response.data;
  if (!base64) throw new Error("Gemini did not return image data");

  await heartbeats.yield();
  const buffer = Buffer.from(base64, "base64");
  await heartbeats.yield();

  const path = `b-roll/${payload.projectId}/${payload.sceneId}.png`;
  const { data: upload, error } = await client.storage
    .from("video-agent")
    .upload(path, new Blob([new Uint8Array(buffer)], { type: "image/png" }));

  if (error || !upload) throw new Error(error?.message || "Failed to upload AI image b-roll");

  return { type: "ai_image" as const, url: upload.url, key: upload.key };
}

async function generateStockBRoll(client: ReturnType<typeof createInsforgeAdminClient>, payload: Payload) {
  const video = await searchPixabayVideo(payload.visualPrompt);

  if (video) {
    const buffer = await fetchUrlToBuffer(video.url);
    const path = `b-roll/${payload.projectId}/${payload.sceneId}.mp4`;
    const { data: upload, error } = await client.storage
      .from("video-agent")
      .upload(path, new Blob([new Uint8Array(buffer)], { type: "video/mp4" }));

    if (error || !upload) throw new Error(error?.message || "Failed to upload stock video");
    return { type: "stock_video" as const, url: upload.url, key: upload.key };
  }

  const image = await searchPixabayImage(payload.visualPrompt);
  if (!image) throw new Error("No stock media found for this scene");

  const buffer = await fetchUrlToBuffer(image.url);
  const path = `b-roll/${payload.projectId}/${payload.sceneId}.jpg`;
  const { data: upload, error } = await client.storage
    .from("video-agent")
    .upload(path, new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }));

  if (error || !upload) throw new Error(error?.message || "Failed to upload stock image");
  return { type: "stock_image" as const, url: upload.url, key: upload.key };
}

async function generateAiVideoBRoll(client: ReturnType<typeof createInsforgeAdminClient>, payload: Payload) {
  const replicate = new Replicate();
  const output = await withReplicateRetry(() =>
    replicate.run("wan-video/wan-2.2-t2v-fast", { input: { prompt: payload.visualPrompt } }),
  );

  const buffer = await fetchReplicateOutputBuffer(output);
  const path = `b-roll/${payload.projectId}/${payload.sceneId}.mp4`;
  const { data: upload, error } = await client.storage
    .from("video-agent")
    .upload(path, new Blob([new Uint8Array(buffer)], { type: "video/mp4" }));

  if (error || !upload) throw new Error(error?.message || "Failed to upload AI video b-roll");
  return { type: "ai_video" as const, url: upload.url, key: upload.key };
}

/**
 * Best-effort progress reporting for the create-form's live "X of Y scenes
 * generated" counter. A plain read-then-increment is race-free today only
 * because this task's own queue is concurrencyLimit: 1 (strictly serial) --
 * if that's ever raised, this needs an atomic RPC instead (same pattern as
 * deduct_credits/refund_credits).
 */
async function incrementScenesCompleted(client: ReturnType<typeof createInsforgeAdminClient>, projectId: string) {
  try {
    const { data: project } = await client.database
      .from("video_agent_projects")
      .select("scenes_completed")
      .eq("id", projectId)
      .single();

    await client.database
      .from("video_agent_projects")
      .update({ scenes_completed: (project?.scenes_completed ?? 0) + 1 })
      .eq("id", projectId);
  } catch {
    // Best-effort only -- never fail the scene task over a progress counter.
  }
}

/**
 * Best-effort: extend the growing live preview with whatever contiguous,
 * gap-free prefix of scenes (starting at scene_index 0) is done so far.
 * This never blocks or fails the task -- generate-video-agent.ts's own
 * final write after the whole batch resolves is still the authoritative
 * composition_data.
 */
async function updatePartialComposition(client: ReturnType<typeof createInsforgeAdminClient>, projectId: string) {
  try {
    const { data: siblingScenes } = await client.database
      .from("video_agent_scenes")
      .select("id, scene_index, start_time, end_time, status, has_avatar_clip, avatar_clip_url, b_roll_type, b_roll_url, illustration_data")
      .eq("project_id", projectId)
      .order("scene_index", { ascending: true });

    const prefix: NonNullable<typeof siblingScenes> = [];
    for (const scene of siblingScenes ?? []) {
      if (scene.status !== "completed") break;
      prefix.push(scene);
    }

    if (prefix.length === 0) return;

    const { data: projectRow } = await client.database
      .from("video_agent_projects")
      .select("aspect_ratio, duration_seconds, narration_audio_url, caption_style, captions_data, transition_style")
      .eq("id", projectId)
      .single();

    if (!projectRow) return;

    const partialComposition = buildCompositionData(projectRow, prefix);
    await client.database.from("video_agent_projects").update({ composition_data: partialComposition }).eq("id", projectId);
  } catch {
    // Best-effort only -- never fail the scene task over a preview update.
  }
}

export const generateVideoAgentSceneTask = task({
  id: "generate-video-agent-scene",
  maxDuration: 600,
  // generate-video-agent fans out one of these per scene via
  // batchTriggerAndWait. Serializing them (concurrencyLimit: 1) keeps peak
  // memory AND event-loop contention bounded -- important locally, where
  // `trigger dev` runs the parent task and every fanned-out scene in one
  // shared Node process/heap with no per-run isolation. On Windows this
  // matters even more: Trigger.dev's checkpoint system is Linux/CRIU-only,
  // so the parent run sitting at batchTriggerAndWait's waitpoint never
  // actually gets checkpointed/released locally -- it stays "EXECUTING"
  // and needs its own heartbeat serviced by this same shared process for
  // the whole wait, which multiple scenes doing CPU work concurrently can
  // starve (TASK_RUN_STALLED_EXECUTING_WITH_WAITPOINTS). This doesn't
  // apply to a real deployed environment, where each run gets its own
  // isolated, checkpoint-capable container.
  queue: {
    concurrencyLimit: 1,
  },
  run: async (rawPayload: Payload) => {
    const payload = payloadSchema.parse(rawPayload);
    const client = createInsforgeAdminClient();

    await client.database.from("video_agent_scenes").update({ status: "processing" }).eq("id", payload.sceneId);

    try {
      const updates: Record<string, unknown> = {};

      if (payload.hasAvatarClip) {
        const clip = await generateAvatarClip(client, payload);
        updates.avatar_clip_url = clip.url;
        updates.avatar_clip_key = clip.key;
      }

      if (payload.needsBRoll) {
        if (payload.bRollStyle === "ai_illustration") {
          const code = await generateIllustrationComponentCode(payload.visualPrompt, payload.sceneDurationSeconds);
          updates.b_roll_type = "ai_illustration";
          updates.illustration_data = { code };
        } else {
          const broll =
            payload.bRollStyle === "ai_image"
              ? await generateAiImageBRoll(client, payload)
              : payload.bRollStyle === "ai_video"
                ? await generateAiVideoBRoll(client, payload)
                : await generateStockBRoll(client, payload);

          updates.b_roll_type = broll.type;
          updates.b_roll_url = broll.url;
          updates.b_roll_key = broll.key;
        }
      }

      await client.database.from("video_agent_scenes").update({ status: "completed", ...updates }).eq("id", payload.sceneId);
      await incrementScenesCompleted(client, payload.projectId);
      await updatePartialComposition(client, payload.projectId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scene generation failed";
      await client.database
        .from("video_agent_scenes")
        .update({ status: "failed", error_message: message })
        .eq("id", payload.sceneId);
      // Still counts toward "processed" so the percentage doesn't stall --
      // it just won't extend the growing preview (updatePartialComposition
      // stops at the first non-completed scene in scene_index order).
      await incrementScenesCompleted(client, payload.projectId);
      throw err;
    }
  },
});
