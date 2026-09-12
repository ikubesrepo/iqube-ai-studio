import { task, metadata } from "@trigger.dev/sdk";
import { z } from "zod";
import Replicate from "replicate";

import { createInsforgeAdminClient } from "@/lib/insforge/admin";
import { convertBufferToWav, convertWavBufferToMp3, fetchUrlToBuffer } from "@/lib/dashboard/voice-cloning/audio";
import { withReplicateRetry } from "@/lib/dashboard/voice-cloning/replicate";

const CALIBRATION_PHRASE = "Hello, this is a quick voice sample used to calibrate this cloned voice.";

const payloadSchema = z.object({
  voiceCloneId: z.string(),
  userId: z.string(),
  name: z.string(),
  sampleAudioUrl: z.string(),
  sampleAudioKey: z.string().optional(),
});

type CloneVoicePayload = z.infer<typeof payloadSchema>;

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

export const cloneVoiceTask = task({
  id: "clone-voice",
  maxDuration: 300,
  run: async (rawPayload: CloneVoicePayload) => {
    const payload = payloadSchema.parse(rawPayload);
    const client = createInsforgeAdminClient();

    await client.database.from("voice_clones").update({ status: "processing" }).eq("id", payload.voiceCloneId);

    try {
      metadata.set("progress", { step: "preparing sample", percentage: 10 });

      const sampleBuffer = await fetchUrlToBuffer(payload.sampleAudioUrl);
      const sampleWavBuffer = await convertBufferToWav(sampleBuffer);

      metadata.set("progress", { step: "cloning", percentage: 20 });

      const replicate = new Replicate();
      const output = await withReplicateRetry(
        () =>
          replicate.run("resemble-ai/chatterbox", {
            input: {
              prompt: CALIBRATION_PHRASE,
              audio_prompt: sampleWavBuffer,
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

      const path = `clones/${payload.voiceCloneId}.mp3`;
      const { data: upload, error: uploadError } = await client.storage
        .from("voices")
        .upload(path, new Blob([new Uint8Array(mp3Buffer)], { type: "audio/mpeg" }));

      if (uploadError || !upload) {
        throw new Error(uploadError?.message || "Failed to upload cloned voice audio");
      }

      await client.database
        .from("voice_clones")
        .update({
          status: "completed",
          cloned_audio_url: upload.url,
          cloned_audio_key: upload.key,
        })
        .eq("id", payload.voiceCloneId);

      metadata.set("progress", { step: "completed", percentage: 100 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Voice cloning failed";
      metadata.set("error", message);
      // Cleanup happens in onFailure (below), which only runs once all of
      // Trigger.dev's automatic retries (trigger.config.ts) are exhausted --
      // deleting the sample here would break a later retry attempt that
      // still needs it, which previously caused a 404 fetching audio_prompt.
      throw err;
    }
  },
  onFailure: async ({ payload: rawPayload }) => {
    const payload = payloadSchema.parse(rawPayload);
    const client = createInsforgeAdminClient();

    if (payload.sampleAudioKey) {
      await client.storage.from("voices").remove([payload.sampleAudioKey]).catch(() => {});
    }

    // Per product spec, voice cloning failures delete the DB record entirely
    // (unlike generate-avatar.ts, which marks status:"failed" and keeps the row).
    await client.database.from("voice_clones").delete().eq("id", payload.voiceCloneId);
  },
});
