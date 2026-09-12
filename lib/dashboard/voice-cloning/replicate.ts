const DEFAULT_MAX_ATTEMPTS = 6;
const MAX_WAIT_MS = 30_000;

function parseRetryAfterSeconds(message: string): number | null {
  const match = message.match(/"retry_after"\s*:\s*(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

function isRateLimitError(err: Error): boolean {
  return err.message.includes("429") || err.message.toLowerCase().includes("too many requests");
}

// Resemble AI's Chatterbox model has a known bug where a Replicate GPU
// worker's CUDA context can get corrupted and then fail on every subsequent
// request routed to that same worker, until a fresh worker picks it up
// (see resemble-ai/chatterbox#148/#175). It isn't caused by our input --
// retrying usually lands on a different, healthy worker.
function isTransientModelError(err: Error): boolean {
  const message = err.message.toLowerCase();
  return message.includes("cuda error") || message.includes("device-side assert");
}

function isRetryableError(err: unknown): err is Error {
  return err instanceof Error && (isRateLimitError(err) || isTransientModelError(err));
}

/**
 * The `replicate` package's own automatic retry never actually applies the
 * `retry_after` value from a 429 response (a backoff-delay bug in its
 * withAutomaticRetries helper resolves to a ~0ms wait), so its 5 built-in
 * retries fire almost instantly and all get throttled again. This wraps a
 * Replicate call with a retry loop that correctly waits out `retry_after`
 * for rate limits, and applies a short exponential backoff for transient
 * model/worker faults (see isTransientModelError above).
 */
export async function withReplicateRetry<T>(
  fn: () => Promise<T>,
  options?: { maxAttempts?: number; onWaiting?: (waitMs: number, attempt: number) => void },
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (!isRetryableError(err) || attempt === maxAttempts - 1) {
        throw err;
      }

      const retryAfterSeconds = parseRetryAfterSeconds(err.message);
      const waitMs = Math.min(
        MAX_WAIT_MS,
        Math.ceil(((retryAfterSeconds ?? 2 ** attempt) + 1) * 1000),
      );

      options?.onWaiting?.(waitMs, attempt);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError;
}
