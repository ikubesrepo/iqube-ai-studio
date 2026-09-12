import { task, metadata } from "@trigger.dev/sdk";
import { z } from "zod";
import Replicate from "replicate";

import { createInsforgeAdminClient } from "@/lib/insforge/admin";
import { convertBufferToWav, convertWavBufferToMp3, fetchUrlToBuffer } from "@/lib/dashboard/voice-cloning/audio";
import { withReplicateRetry } from "@/lib/dashboard/voice-cloning/replicate";

const payloadSchema = z.object({
  ttsGenerationId: z.string(),
  userId: z.string(),
  text: z.string(),
  audioPromptUrl: z.string(),
  creditsCharged: z.number(),
});

type GenerateTtsPayload = z.infer<typeof payloadSchema>;

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

export const generateVoiceTtsTask = task({
  id: "generate-voice-tts",
  maxDuration: 300,
  run: async (rawPayload: GenerateTtsPayload) => {
    const payload = payloadSchema.parse(rawPayload);
    const client = createInsforgeAdminClient();

    await client.database.from("tts_generations").update({ status: "processing" }).eq("id", payload.ttsGenerationId);

    try {
      metadata.set("progress", { step: "preparing voice", percentage: 10 });

      const referenceBuffer = await fetchUrlToBuffer(payload.audioPromptUrl);
      const referenceWavBuffer = await convertBufferToWav(referenceBuffer);

      metadata.set("progress", { step: "generating", percentage: 20 });

      const replicate = new Replicate();
      const output = await withReplicateRetry(
        () =>
          replicate.run("resemble-ai/chatterbox", {
            input: {
              prompt: payload.text,
              audio_prompt: referenceWavBuffer,
            },
          }),
        {
          onWaiting: (waitMs) => {
            metadata.set("progress", {
              step: `rate limited, retrying in ${Math.round(waitMs / 1000)}s`,
              percentage: 15,
            });
          },
        },
      );

      metadata.set("progress", { step: "converting", percentage: 60 });

      const wavBuffer = await fetchOutputBuffer(output);
      const mp3Buffer = await convertWavBufferToMp3(wavBuffer);

      metadata.set("progress", { step: "uploading", percentage: 85 });

      const path = `tts/${payload.ttsGenerationId}.mp3`;
      const { data: upload, error: uploadError } = await client.storage
        .from("voices")
        .upload(path, new Blob([new Uint8Array(mp3Buffer)], { type: "audio/mpeg" }));

      if (uploadError || !upload) {
        throw new Error(uploadError?.message || "Failed to upload generated audio");
      }

      await client.database
        .from("tts_generations")
        .update({
          status: "completed",
          audio_url: upload.url,
          audio_key: upload.key,
        })
        .eq("id", payload.ttsGenerationId);

      metadata.set("progress", { step: "completed", percentage: 100 });
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

    // Unlike voice cloning, a failed TTS generation keeps its row (with an
    // error message) and refunds the credits, rather than being deleted.
    await client.database.rpc("refund_credits", { p_user_id: payload.userId, p_amount: payload.creditsCharged });

    await client.database
      .from("tts_generations")
      .update({ status: "failed", error_message: message })
      .eq("id", payload.ttsGenerationId);
  },
});
