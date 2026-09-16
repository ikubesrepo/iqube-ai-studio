import { task, metadata, heartbeats } from "@trigger.dev/sdk";
import { z } from "zod";

import { createInsforgeAdminClient } from "@/lib/insforge/admin";
import { extractAudioSlice, fetchUrlToBuffer, getAudioDurationSeconds } from "@/lib/dashboard/voice-cloning/audio";
import { spliceAudioSegment } from "@/lib/dashboard/video-agent/audio-splice";
import { synthesizeNarration } from "@/lib/dashboard/video-avatars/narration";
import { generateTalkingAvatarVideo } from "@/lib/dashboard/video-avatars/talking-avatar";
import { buildCompositionData } from "@/lib/dashboard/video-agent/composition-builder";
import { generateAiImageBRoll, generateAiVideoBRoll, generateStockBRoll } from "@/lib/dashboard/video-agent/broll-generation";
import type { BRollStyle } from "@/lib/dashboard/video-agent/pricing";

// Matches DomoAI's own per-request cap used elsewhere in the app
// (lib/dashboard/video-avatars/domoai.ts's DOMOAI_MAX_CLIP_SECONDS is 3s per
// *request*, but generateTalkingAvatarVideo already chunks/stitches longer
// audio automatically) -- the product-level cap requested for an
// edit-screen scene avatar clip is 5s.
const MAX_SCENE_AVATAR_SECONDS = 5;

const payloadSchema = z.object({
  projectId: z.string(),
  sceneId: z.string(),
  userId: z.string(),
  avatarImageUrl: z.string(),
  aspectRatio: z.enum(["16:9", "9:16"]),
  sceneText: z.string().min(1),
  voiceCloneAudioUrl: z.string().optional(),
  defaultVoiceModelId: z.string().optional(),
  bRollStyle: z.enum(["ai_image", "stock", "ai_video", "ai_illustration"]).optional(),
  prompt: z.string().optional(),
});

type Payload = z.infer<typeof payloadSchema>;

const STEPS = {
  synthesizingVoice: "Synthesizing scene narration",
  generatingAvatar: "Generating avatar video",
  splicingAudio: "Updating narration track",
  fillingRemainder: "Filling remaining scene time",
  saving: "Saving scene",
  refreshing: "Refreshing composition",
  completed: "Completed",
} as const;

export const regenerateVideoAgentSceneAvatarTask = task({
  id: "regenerate-video-agent-scene-avatar",
  maxDuration: 600,
  run: async (rawPayload: Payload) => {
    const payload = payloadSchema.parse(rawPayload);
    const client = createInsforgeAdminClient();

    const { data: scene, error: sceneError } = await client.database
      .from("video_agent_scenes")
      .select("id, start_time, end_time, b_roll_url, visual_prompt")
      .eq("id", payload.sceneId)
      .single();

    const { data: project, error: projectError } = await client.database
      .from("video_agent_projects")
      .select("aspect_ratio, duration_seconds, narration_audio_url, caption_style, captions_data, transition_style")
      .eq("id", payload.projectId)
      .single();

    if (sceneError || !scene || projectError || !project?.narration_audio_url) {
      throw new Error(sceneError?.message || projectError?.message || "Scene or master narration not found");
    }

    const sceneWindowSeconds = Math.max(0.1, scene.end_time - scene.start_time);

    metadata.set("progress", { step: STEPS.synthesizingVoice, percentage: 10 });
    const synthesizedNarration = await synthesizeNarration(payload.sceneText, {
      voiceCloneAudioUrl: payload.voiceCloneAudioUrl,
      defaultVoiceModelId: payload.defaultVoiceModelId,
    });

    await heartbeats.yield();
    const synthesizedDuration = await getAudioDurationSeconds(synthesizedNarration);
    const avatarSeconds = Math.min(synthesizedDuration, MAX_SCENE_AVATAR_SECONDS, sceneWindowSeconds);
    const avatarNarrationClip = await extractAudioSlice(synthesizedNarration, 0, avatarSeconds);

    metadata.set("progress", { step: STEPS.generatingAvatar, percentage: 35 });
    // DomoAI-primary / SadTalker-fallback lives entirely inside this helper
    // (lib/dashboard/video-avatars/talking-avatar.ts) -- unchanged here.
    const avatarVideoBuffer = await generateTalkingAvatarVideo({
      avatarImageUrl: payload.avatarImageUrl,
      narrationMp3: avatarNarrationClip,
      aspectRatio: payload.aspectRatio,
      prompt: payload.prompt,
    });

    await heartbeats.yield();

    const avatarClipPath = `avatar-clips/${payload.projectId}/${payload.sceneId}.mp4`;
    const { data: avatarUpload, error: avatarUploadError } = await client.storage
      .from("video-agent")
      .upload(avatarClipPath, new Blob([new Uint8Array(avatarVideoBuffer)], { type: "video/mp4" }));

    if (avatarUploadError || !avatarUpload) {
      throw new Error(avatarUploadError?.message || "Failed to upload avatar clip");
    }

    metadata.set("progress", { step: STEPS.splicingAudio, percentage: 55 });
    const masterNarrationBuffer = await fetchUrlToBuffer(project.narration_audio_url);
    const splicedNarrationBuffer = await spliceAudioSegment(
      masterNarrationBuffer,
      avatarNarrationClip,
      scene.start_time,
      scene.start_time + avatarSeconds,
    );

    const narrationPath = `narration/${payload.projectId}.mp3`;
    const { data: narrationUpload, error: narrationUploadError } = await client.storage
      .from("video-agent")
      .upload(narrationPath, new Blob([new Uint8Array(splicedNarrationBuffer)], { type: "audio/mpeg" }));

    if (narrationUploadError || !narrationUpload) {
      throw new Error(narrationUploadError?.message || "Failed to upload updated narration track");
    }

    // "adjust the remaining scene duration using the existing B-roll assets
    // or newly generated assets" -- if this scene already has B-roll, its
    // on-screen duration already auto-shrinks/grows to fill whatever time
    // isn't covered by the avatar clip (see buildVisualSegments' remainder
    // handling in remotion/VideoAgentComposition.tsx), so nothing else to
    // do. Only generate a fresh one when the scene has none and there's a
    // meaningful gap left to fill.
    const remainderSeconds = sceneWindowSeconds - avatarSeconds;
    let newBRoll: { b_roll_type: string; b_roll_url: string; b_roll_key: string } | null = null;

    if (!scene.b_roll_url && remainderSeconds > 0.5 && payload.bRollStyle && scene.visual_prompt) {
      metadata.set("progress", { step: STEPS.fillingRemainder, percentage: 70 });
      const style: BRollStyle = payload.bRollStyle;
      const broll =
        style === "ai_image"
          ? await generateAiImageBRoll(client, payload.projectId, payload.sceneId, scene.visual_prompt, payload.aspectRatio)
          : style === "ai_video"
            ? await generateAiVideoBRoll(client, payload.projectId, payload.sceneId, scene.visual_prompt)
            : style === "stock"
              ? await generateStockBRoll(client, payload.projectId, payload.sceneId, scene.visual_prompt)
              : null;

      if (broll && broll.type !== "ai_illustration") {
        newBRoll = { b_roll_type: broll.type, b_roll_url: broll.url, b_roll_key: broll.key };
      }
    }

    metadata.set("progress", { step: STEPS.saving, percentage: 85 });
    const { error: sceneUpdateError } = await client.database
      .from("video_agent_scenes")
      .update({
        has_avatar_clip: true,
        avatar_clip_url: avatarUpload.url,
        avatar_clip_key: avatarUpload.key,
        avatar_clip_duration_seconds: avatarSeconds,
        status: "completed",
        error_message: null,
        ...(newBRoll ?? {}),
      })
      .eq("id", payload.sceneId);

    if (sceneUpdateError) {
      throw new Error(sceneUpdateError.message);
    }

    metadata.set("progress", { step: STEPS.refreshing, percentage: 92 });

    const { data: scenes, error: scenesError } = await client.database
      .from("video_agent_scenes")
      .select(
        "id, scene_index, start_time, end_time, has_avatar_clip, avatar_clip_url, avatar_clip_duration_seconds, b_roll_type, b_roll_url, illustration_data",
      )
      .eq("project_id", payload.projectId)
      .order("scene_index", { ascending: true });

    if (scenesError || !scenes) {
      throw new Error(scenesError?.message || "Failed to reload scenes for composition rebuild");
    }

    const compositionData = buildCompositionData({ ...project, narration_audio_url: narrationUpload.url }, scenes);

    await client.database
      .from("video_agent_projects")
      .update({
        composition_data: compositionData,
        narration_audio_url: narrationUpload.url,
        narration_audio_key: narrationUpload.key,
        status: "awaiting_render",
      })
      .eq("id", payload.projectId);

    metadata.set("progress", { step: STEPS.completed, percentage: 100 });

    return { compositionData };
  },
  onFailure: async ({ payload: rawPayload, error }) => {
    const payload = payloadSchema.parse(rawPayload);
    const client = createInsforgeAdminClient();
    const message = error instanceof Error ? error.message : "Avatar scene generation failed";

    await client.database.from("video_agent_scenes").update({ status: "failed", error_message: message }).eq("id", payload.sceneId);
  },
});
