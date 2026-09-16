import "server-only";

import Replicate from "replicate";

import { concatAudioBuffers, convertBufferToWav, convertWavBufferToMp3, fetchUrlToBuffer } from "@/lib/dashboard/voice-cloning/audio";
import { withReplicateRetry } from "@/lib/dashboard/voice-cloning/replicate";
import { synthesizeDeepgramSpeech } from "@/lib/dashboard/video-avatars/deepgram-tts";

// Resemble AI's Chatterbox model has no documented duration/length cap in
// its input schema (checked live: prompt/audio_prompt/seed/cfg_weight/
// temperature/exaggeration only), but it's an autoregressive model that in
// practice silently truncates generation on long text instead of erroring
// -- a 60-120s script sent in one call can come back as ~40s of audio with
// no error, silently shipping a shorter video than requested. Chunking
// text at sentence boundaries and stitching the results (same chunk/stitch
// shape as DomoAI's talking-avatar 3s cap in domoai.ts) keeps each request
// well under the point where truncation has been observed.
const CHATTERBOX_MAX_WORDS_PER_CHUNK = 80;

/**
 * Splits text into chunks of at most `maxWords` words each, breaking only
 * at sentence boundaries so no chunk ends mid-sentence (which would
 * otherwise leave an audible gap/mispaced breath at the stitch point). A
 * single sentence longer than `maxWords` is kept whole as its own chunk
 * rather than being cut mid-sentence.
 */
function splitIntoSentenceChunks(text: string, maxWords: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text.trim()];

  const chunks: string[] = [];
  let current: string[] = [];
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const wordCount = sentence.split(/\s+/).filter(Boolean).length;

    if (currentWordCount > 0 && currentWordCount + wordCount > maxWords) {
      chunks.push(current.join(" "));
      current = [];
      currentWordCount = 0;
    }

    current.push(sentence);
    currentWordCount += wordCount;
  }

  if (current.length > 0) {
    chunks.push(current.join(" "));
  }

  return chunks;
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

  const chunks = splitIntoSentenceChunks(text, CHATTERBOX_MAX_WORDS_PER_CHUNK);
  const mp3Chunks: Buffer[] = [];

  for (const chunk of chunks) {
    const output = await withReplicateRetry(() =>
      replicate.run("resemble-ai/chatterbox", {
        input: {
          prompt: chunk,
          audio_prompt: referenceWavBuffer,
        },
      }),
    );

    const wavBuffer = await fetchOutputBuffer(output);
    mp3Chunks.push(await convertWavBufferToMp3(wavBuffer));
  }

  return concatAudioBuffers(mp3Chunks);
}
