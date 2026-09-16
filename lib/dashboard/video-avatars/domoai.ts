import "server-only";

import { heartbeats } from "@trigger.dev/sdk";

import { fetchUrlToBuffer, splitAudioIntoChunks } from "@/lib/dashboard/voice-cloning/audio";
import { concatVideoBuffers } from "@/lib/dashboard/video-avatars/video-concat";

const DOMOAI_BASE_URL = "https://api.domoai.com";

// DomoAI's talking-avatar endpoint rejects requests over 3 seconds
// ("Target video duration cannot exceed 3s", confirmed via a live 400
// response -- contradicts the 1-60s range implied by partial docs).
// Callers needing a longer result must generate multiple <=3s clips and
// concatenate them (see lib/dashboard/video-avatars/video-concat.ts);
// this constant is also a defense-in-depth clamp here in case a caller
// ever passes more.
export const DOMOAI_MAX_CLIP_SECONDS = 3;

export type DomoaiTaskStatus = "PENDING" | "QUEUING" | "PROCESSING" | "SUCCESS" | "FAILED" | "CANCELED";

const TERMINAL_STATUSES = new Set<DomoaiTaskStatus>(["SUCCESS", "FAILED", "CANCELED"]);

type DomoaiOutputVideo = { url: string; width: number; height: number };

function domoaiHeaders() {
  const apiKey = process.env.DOMOAI_API_KEY;

  if (!apiKey) {
    throw new Error("DomoAI is not configured yet.");
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function extractDomoaiErrorMessage(body: unknown, status: number, rawText: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.message === "string") return `DomoAI: ${record.message}`;
    // DomoAI's request-validation errors come back FastAPI-style as
    // {"detail": [{"msg": "...", "loc": [...]}]} rather than {"message"}.
    if (Array.isArray(record.detail)) {
      const joined = record.detail
        .map((item) => (item && typeof item === "object" && "msg" in item ? String((item as { msg: unknown }).msg) : JSON.stringify(item)))
        .join("; ");
      return `DomoAI: ${joined}`;
    }
    if (typeof record.detail === "string") return `DomoAI: ${record.detail}`;
    if (typeof record.error === "string") return `DomoAI: ${record.error}`;
  }
  // Unknown error shape -- surface the raw response body (truncated) so the
  // exact rejection reason is visible instead of just a status code. This
  // was flagged as an open risk in the implementation plan: DomoAI's exact
  // error envelope was inferred from partial docs and needed live verification.
  const snippet = rawText ? rawText.slice(0, 500) : "(empty response body)";
  return `DomoAI request failed (${status}): ${snippet}`;
}

export async function submitTalkingAvatarTask(input: {
  imageBase64: string;
  audioBase64: string;
  seconds: number;
  aspectRatio: "16:9" | "9:16";
  prompt?: string;
}): Promise<{ taskId: string }> {
  const response = await fetch(`${DOMOAI_BASE_URL}/v1/video/talking-avatar`, {
    method: "POST",
    headers: domoaiHeaders(),
    body: JSON.stringify({
      model: "talking-avatar-v1",
      image: { bytes_base64_encoded: input.imageBase64 },
      audio: { bytes_base64_encoded: input.audioBase64 },
      // DomoAI requires an integer number of seconds -- our chunk durations
      // come from real audio-slice lengths (fractional), so round after
      // clamping to the 3s cap, with a 1s floor since 0 isn't valid either.
      seconds: Math.max(1, Math.round(Math.min(input.seconds, DOMOAI_MAX_CLIP_SECONDS))),
      aspect_ratio: input.aspectRatio,
      prompt: input.prompt,
    }),
  });

  const rawText = await response.text();
  const body = (() => {
    try {
      return JSON.parse(rawText);
    } catch {
      return null;
    }
  })();

  if (!response.ok || !body?.data?.task_id) {
    throw new Error(extractDomoaiErrorMessage(body, response.status, rawText));
  }

  return { taskId: body.data.task_id as string };
}

export async function getTaskStatus(taskId: string): Promise<{
  status: DomoaiTaskStatus;
  outputVideos?: DomoaiOutputVideo[];
  error?: string;
}> {
  const response = await fetch(`${DOMOAI_BASE_URL}/v1/tasks/${encodeURIComponent(taskId)}`, {
    headers: domoaiHeaders(),
  });

  const rawText = await response.text();
  const body = (() => {
    try {
      return JSON.parse(rawText);
    } catch {
      return null;
    }
  })();

  if (!response.ok || !body?.data) {
    throw new Error(extractDomoaiErrorMessage(body, response.status, rawText));
  }

  return {
    status: body.data.status as DomoaiTaskStatus,
    outputVideos: body.data.output_videos as DomoaiOutputVideo[] | undefined,
    error: body.data.error as string | undefined,
  };
}

/**
 * DomoAI's callback_url webhook isn't used here -- this repo's existing
 * Trigger.dev tasks (clone-voice, generate-voice-tts, generate-avatar) all
 * await their third-party calls synchronously rather than adding a webhook
 * route, so this follows the same pattern for consistency.
 */
export async function pollTaskUntilTerminal(
  taskId: string,
  opts?: { intervalMs?: number; timeoutMs?: number; onPoll?: (status: DomoaiTaskStatus) => void },
): Promise<DomoaiOutputVideo> {
  const intervalMs = opts?.intervalMs ?? 5000;
  const timeoutMs = opts?.timeoutMs ?? 10 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { status, outputVideos, error } = await getTaskStatus(taskId);
    opts?.onPoll?.(status);

    if (status === "SUCCESS") {
      const video = outputVideos?.[0];
      if (!video) {
        throw new Error("DomoAI reported success but returned no video output");
      }
      return video;
    }

    if (TERMINAL_STATUSES.has(status)) {
      throw new Error(error || `DomoAI generation failed with status ${status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("Timed out waiting for DomoAI video generation");
}

async function fetchAsBase64(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch source image: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // Local `trigger dev` on Windows can't checkpoint a waiting run (Trigger.dev's
  // checkpoint system is Linux/CRIU-only), so yielding around this synchronous
  // conversion keeps this run's heartbeat serviced during local dev.
  await heartbeats.yield();
  const data = buffer.toString("base64");
  await heartbeats.yield();

  return data;
}

/**
 * Generates a talking-avatar video for the full narration length via DomoAI,
 * working around its 3-second-per-request cap by splitting the narration
 * into <=3s chunks, generating one avatar clip per chunk, and stitching
 * them back together. This is the DomoAI-specific half of
 * lib/dashboard/video-avatars/talking-avatar.ts's provider fallback.
 */
export async function generateDomoaiTalkingAvatarVideo(input: {
  avatarImageUrl: string;
  narrationMp3: Buffer;
  aspectRatio: "16:9" | "9:16";
}): Promise<Buffer> {
  const imageBase64 = await fetchAsBase64(input.avatarImageUrl);
  const audioChunks = await splitAudioIntoChunks(input.narrationMp3, DOMOAI_MAX_CLIP_SECONDS);

  const clipTaskIds: string[] = [];
  for (const chunk of audioChunks) {
    const { taskId } = await submitTalkingAvatarTask({
      imageBase64,
      audioBase64: chunk.buffer.toString("base64"),
      seconds: chunk.durationSeconds,
      aspectRatio: input.aspectRatio,
    });
    clipTaskIds.push(taskId);
  }

  const clipVideos = await Promise.all(clipTaskIds.map((taskId) => pollTaskUntilTerminal(taskId)));
  await heartbeats.yield();
  const clipBuffers = await Promise.all(clipVideos.map((video) => fetchUrlToBuffer(video.url)));
  return concatVideoBuffers(clipBuffers);
}
