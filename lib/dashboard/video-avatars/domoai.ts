import "server-only";

const DOMOAI_BASE_URL = "https://api.domoai.com";

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
      seconds: input.seconds,
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
