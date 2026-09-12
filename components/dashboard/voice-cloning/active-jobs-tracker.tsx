"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

import { toast } from "@/components/ui/toast";

const TERMINAL_FAILURE_STATUSES = new Set(["FAILED", "CRASHED", "SYSTEM_FAILURE", "TIMED_OUT", "EXPIRED", "CANCELED"]);

export type TrackedJob = {
  id: string;
  kind: "clone" | "tts";
  runId: string;
  publicToken: string;
  label: string;
};

type JobsContextValue = {
  startJob: (job: Omit<TrackedJob, "id">) => void;
};

const JobsContext = createContext<JobsContextValue | null>(null);

export function useVoiceCloningJobs() {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useVoiceCloningJobs must be used within VoiceCloningJobsProvider");
  return ctx;
}

function JobWatcher({ job, onSettled }: { job: TrackedJob; onSettled: (id: string) => void }) {
  const router = useRouter();
  const toastIdRef = useRef<string | null>(null);
  const settledRef = useRef(false);

  const { run } = useRealtimeRun(job.runId, {
    accessToken: job.publicToken,
    enabled: true,
  });

  useEffect(() => {
    if (toastIdRef.current) return;

    toastIdRef.current = toast.add({
      title: job.kind === "clone" ? `Cloning "${job.label}"…` : "Generating speech…",
      description: "Starting…",
      type: "loading",
      timeout: 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!run || !toastIdRef.current || settledRef.current) return;

    const progress = run.metadata?.progress as { step: string; percentage: number } | undefined;

    if (run.status === "COMPLETED") {
      settledRef.current = true;
      toast.update(toastIdRef.current, {
        type: "success",
        title: job.kind === "clone" ? "Voice cloned" : "Speech generated",
        description:
          job.kind === "clone" ? `"${job.label}" is ready to use.` : "Your generated audio is ready to play.",
        timeout: 6000,
      });
      router.refresh();
      window.setTimeout(() => onSettled(job.id), 6500);
    } else if (TERMINAL_FAILURE_STATUSES.has(run.status)) {
      settledRef.current = true;
      const errorMessage = (run.metadata?.error as string | undefined) || "Something went wrong. Please try again.";
      toast.update(toastIdRef.current, {
        type: "error",
        title: job.kind === "clone" ? "Voice cloning failed" : "Speech generation failed",
        description: errorMessage,
        timeout: 8000,
      });
      router.refresh();
      window.setTimeout(() => onSettled(job.id), 8500);
    } else if (progress && toastIdRef.current) {
      toast.update(toastIdRef.current, {
        description: `${progress.step ? `${progress.step[0].toUpperCase()}${progress.step.slice(1)}…` : "Working…"} ${progress.percentage}%`,
      });
    }
  }, [run, job, onSettled, router]);

  return null;
}

export function VoiceCloningJobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<TrackedJob[]>([]);

  const startJob = useCallback((job: Omit<TrackedJob, "id">) => {
    setJobs((prev) => [...prev, { ...job, id: `${job.kind}-${job.runId}` }]);
  }, []);

  const handleSettled = useCallback((id: string) => {
    setJobs((prev) => prev.filter((job) => job.id !== id));
  }, []);

  return (
    <JobsContext.Provider value={{ startJob }}>
      {children}
      {jobs.map((job) => (
        <JobWatcher job={job} key={job.id} onSettled={handleSettled} />
      ))}
    </JobsContext.Provider>
  );
}
