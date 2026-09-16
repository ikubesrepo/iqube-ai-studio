import "server-only";

import Replicate from "replicate";

import { convertBufferToWav, convertWavBufferToMp3, fetchUrlToBuffer } from "@/lib/dashboard/voice-cloning/audio";
import { withReplicateRetry } from "@/lib/dashboard/voice-cloning/replicate";
import { synthesizeDeepgramSpeech } from "@/lib/dashboard/video-avatars/deepgram-tts";

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

/**
 * Synthesizes narration audio (mp3) for the given text in the chosen
 * voice: Deepgram Aura TTS directly for default voices (no Replicate
 * needed -- default voices ARE Deepgram voices), or Replicate's Chatterbox
 * model for a cloned voice (matches an arbitrary uploaded voice sample).
 * Shared between the single-clip AI Video Avatar task and the AI Video
 * Agent's per-scene avatar clips / full-script voiceover.
 */
export async function synthesizeNarration(
  text: string,
  voice: { voiceCloneAudioUrl?: string; defaultVoiceModelId?: string },
): Promise<Buffer> {
  if (voice.defaultVoiceModelId) {
    return synthesizeDeepgramSpeech(voice.defaultVoiceModelId, text);
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
        prompt: text,
        audio_prompt: referenceWavBuffer,
      },
    }),
  );

  const wavBuffer = await fetchOutputBuffer(output);
  return convertWavBufferToMp3(wavBuffer);
}
