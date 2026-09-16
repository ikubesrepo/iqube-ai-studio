"use client";

import { useEffect, useRef } from "react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

const TERMINAL_FAILURE_STATUSES = new Set(["FAILED", "CRASHED", "SYSTEM_FAILURE", "TIMED_OUT", "EXPIRED", "CANCELED"]);

/**
 * Watches exactly one Trigger.dev run to completion/failure, invisibly.
 * Mounted once per in-flight scene edit (video-editor-client.tsx keys one
 * of these per active run) so multiple scene regenerations can be tracked
 * concurrently without violating the rules of hooks (useRealtimeRun can't
 * be called a variable number of times in a single component).
 */
export function SceneRunWatcher({
  runId,
  publicToken,
  onCompleted,
  onFailed,
  onProgress,
}: {
  runId: string;
  publicToken: string;
  onCompleted: () => void;
  onFailed: (message: string) => void;
  onProgress?: (progress: { step: string; percentage: number }) => void;
}) {
  const { run } = useRealtimeRun(runId, { accessToken: publicToken });
  const settledRef = useRef(false);

  useEffect(() => {
    const progress = run?.metadata?.progress as { step: string; percentage: number } | undefined;
    if (progress) onProgress?.(progress);
  }, [run, onProgress]);

  useEffect(() => {
    if (!run || settledRef.current) return;

    if (run.status === "COMPLETED") {
      settledRef.current = true;
      onCompleted();
    } else if (TERMINAL_FAILURE_STATUSES.has(run.status)) {
      settledRef.current = true;
      // The task's own onFailure handler writes the real error_message onto
      // the scene row -- the parent re-fetches that scene on failure, so a
      // generic message here is only ever a brief placeholder.
      onFailed("Generation failed. Please try again.");
    }
  }, [run, onCompleted, onFailed]);

  return null;
}
