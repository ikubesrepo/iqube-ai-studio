import { task, metadata } from "@trigger.dev/sdk";
import { z } from "zod";

import { createInsforgeAdminClient } from "@/lib/insforge/admin";
import { renderVideoAgentComposition } from "@/lib/dashboard/video-agent/render";
import type { VideoAgentCompositionProps } from "@/remotion/types";

const payloadSchema = z.object({
  projectId: z.string(),
  userId: z.string(),
  creditsCharged: z.number(),
});

type Payload = z.infer<typeof payloadSchema>;

// These step labels are read verbatim by the create-video-agent-form's
// render-stage progress panel -- keep them byte-identical.
const STEPS = {
  loadingComposition: "Loading composition",
  rendering: "Rendering final video",
  uploading: "Uploading video",
  completed: "Completed",
} as const;

export const renderVideoAgentTask = task({
  id: "render-video-agent",
  maxDuration: 1800,
  run: async (rawPayload: Payload) => {
    const payload = payloadSchema.parse(rawPayload);
    const client = createInsforgeAdminClient();

    try {
      metadata.set("progress", { step: STEPS.loadingComposition, percentage: 5 });

      const { data: project, error: projectError } = await client.database
        .from("video_agent_projects")
        .select("composition_data")
        .eq("id", payload.projectId)
        .single();

      if (projectError || !project?.composition_data) {
        throw new Error(projectError?.message || "Composition data not found -- run prepare again.");
      }

      const compositionData = project.composition_data as VideoAgentCompositionProps;

      metadata.set("progress", { step: STEPS.rendering, percentage: 15 });
      const renderedBuffer = await renderVideoAgentComposition(compositionData);

      metadata.set("progress", { step: STEPS.uploading, percentage: 85 });
      const videoPath = `videos/${payload.projectId}.mp4`;
      // Zero-copy view over the same underlying ArrayBuffer -- `new
      // Uint8Array(renderedBuffer)` (a Buffer, itself a Uint8Array
      // subclass) allocates and copies the whole video a second time,
      // which was the largest single contributor to the heap-OOM crash on
      // longer renders.
      const renderedBufferView = new Uint8Array(
        renderedBuffer.buffer as ArrayBuffer,
        renderedBuffer.byteOffset,
        renderedBuffer.byteLength,
      );
      const { data: videoUpload, error: videoUploadError } = await client.storage
        .from("video-agent")
        .upload(videoPath, new Blob([renderedBufferView], { type: "video/mp4" }));

      if (videoUploadError || !videoUpload) {
        throw new Error(videoUploadError?.message || "Failed to upload rendered video");
      }

      await client.database
        .from("video_agent_projects")
        .update({ status: "completed", video_url: videoUpload.url, video_key: videoUpload.key })
        .eq("id", payload.projectId);

      metadata.set("progress", { step: STEPS.completed, percentage: 100 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Render failed";
      metadata.set("error", message);
      throw err;
    }
  },
  onFailure: async ({ payload: rawPayload, error }) => {
    const payload = payloadSchema.parse(rawPayload);
    const client = createInsforgeAdminClient();
    const message = error instanceof Error ? error.message : "Render failed";

    await client.database.rpc("refund_credits", { p_user_id: payload.userId, p_amount: payload.creditsCharged });

    await client.database
      .from("video_agent_projects")
      .update({ status: "failed", error_message: message })
      .eq("id", payload.projectId);
  },
});
