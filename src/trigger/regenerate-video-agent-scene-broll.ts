import { task, metadata } from "@trigger.dev/sdk";
import { z } from "zod";

import { createInsforgeAdminClient } from "@/lib/insforge/admin";
import { buildCompositionData } from "@/lib/dashboard/video-agent/composition-builder";
import {
  generateAiIllustrationBRoll,
  generateAiImageBRoll,
  generateAiVideoBRoll,
  generateStockBRoll,
  uploadPickedStockBRoll,
} from "@/lib/dashboard/video-agent/broll-generation";

const payloadSchema = z.object({
  projectId: z.string(),
  sceneId: z.string(),
  userId: z.string(),
  bRollStyle: z.enum(["ai_image", "ai_video", "stock", "ai_illustration"]),
  visualPrompt: z.string().min(1),
  aspectRatio: z.enum(["16:9", "9:16"]),
  sceneDurationSeconds: z.number(),
  stockPick: z.object({ type: z.enum(["stock_image", "stock_video"]), url: z.string() }).optional(),
});

type Payload = z.infer<typeof payloadSchema>;

// Read by the editor's per-scene progress UI -- keep in sync with any UI
// step list built against this task.
const STEPS = {
  generating: "Generating new scene asset",
  saving: "Saving scene",
  refreshing: "Refreshing composition",
  completed: "Completed",
} as const;

export const regenerateVideoAgentSceneBRollTask = task({
  id: "regenerate-video-agent-scene-broll",
  maxDuration: 300,
  run: async (rawPayload: Payload) => {
    const payload = payloadSchema.parse(rawPayload);
    const client = createInsforgeAdminClient();

    metadata.set("progress", { step: STEPS.generating, percentage: 10 });

    const broll =
      payload.bRollStyle === "ai_illustration"
        ? await generateAiIllustrationBRoll(payload.visualPrompt, payload.sceneDurationSeconds)
        : payload.bRollStyle === "stock" && payload.stockPick
          ? await uploadPickedStockBRoll(client, payload.projectId, payload.sceneId, payload.stockPick)
          : payload.bRollStyle === "ai_image"
            ? await generateAiImageBRoll(client, payload.projectId, payload.sceneId, payload.visualPrompt, payload.aspectRatio)
            : payload.bRollStyle === "ai_video"
              ? await generateAiVideoBRoll(client, payload.projectId, payload.sceneId, payload.visualPrompt)
              : await generateStockBRoll(client, payload.projectId, payload.sceneId, payload.visualPrompt);

    metadata.set("progress", { step: STEPS.saving, percentage: 60 });

    const sceneUpdates: Record<string, unknown> =
      broll.type === "ai_illustration"
        ? { b_roll_type: "ai_illustration", illustration_data: { code: broll.code }, b_roll_url: null, b_roll_key: null, has_b_roll: true }
        : { b_roll_type: broll.type, b_roll_url: broll.url, b_roll_key: broll.key, illustration_data: null, has_b_roll: true };

    const { error: sceneUpdateError } = await client.database
      .from("video_agent_scenes")
      .update({ ...sceneUpdates, status: "completed", error_message: null })
      .eq("id", payload.sceneId);

    if (sceneUpdateError) {
      throw new Error(sceneUpdateError.message);
    }

    metadata.set("progress", { step: STEPS.refreshing, percentage: 80 });

    const { data: scenes, error: scenesError } = await client.database
      .from("video_agent_scenes")
      .select(
        "id, scene_index, start_time, end_time, has_avatar_clip, avatar_clip_url, avatar_clip_duration_seconds, b_roll_type, b_roll_url, illustration_data",
      )
      .eq("project_id", payload.projectId)
      .order("scene_index", { ascending: true });

    const { data: project, error: projectError } = await client.database
      .from("video_agent_projects")
      .select("aspect_ratio, duration_seconds, narration_audio_url, caption_style, captions_data, transition_style")
      .eq("id", payload.projectId)
      .single();

    if (scenesError || !scenes || projectError || !project) {
      throw new Error(scenesError?.message || projectError?.message || "Failed to reload project for composition rebuild");
    }

    const compositionData = buildCompositionData(project, scenes);

    await client.database
      .from("video_agent_projects")
      .update({ composition_data: compositionData, status: "awaiting_render" })
      .eq("id", payload.projectId);

    metadata.set("progress", { step: STEPS.completed, percentage: 100 });

    return { compositionData };
  },
  onFailure: async ({ payload: rawPayload, error }) => {
    const payload = payloadSchema.parse(rawPayload);
    const client = createInsforgeAdminClient();
    const message = error instanceof Error ? error.message : "Scene asset generation failed";

    await client.database.from("video_agent_scenes").update({ status: "failed", error_message: message }).eq("id", payload.sceneId);
  },
});
