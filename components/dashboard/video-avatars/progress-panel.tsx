"use client";

import { CheckIcon, Loader2Icon } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// Must stay byte-identical to the STEPS labels set via metadata.set("progress", ...)
// in src/trigger/generate-video-avatar.ts -- the task's free-text step name is
// matched against this array by index to derive done/current/pending state.
export const STEP_LABELS = [
  "Preparing avatar",
  "Preparing voice",
  "Generating video",
  "Processing output",
  "Uploading to storage",
  "Completed",
] as const;

export function ProgressPanel({ step, percentage }: { step?: string; percentage: number }) {
  const currentIndex = step ? STEP_LABELS.indexOf(step as (typeof STEP_LABELS)[number]) : -1;

  return (
    <div className="space-y-4">
      <Progress value={percentage} />
      <ol className="space-y-2.5">
        {STEP_LABELS.map((label, index) => {
          const isDone = currentIndex > index || (currentIndex === STEP_LABELS.length - 1 && index === currentIndex);
          const isCurrent = index === currentIndex && !isDone;

          return (
            <li className="flex items-center gap-2.5 text-sm" key={label}>
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                  isDone
                    ? "border-primary bg-primary text-primary-foreground"
                    : isCurrent
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground",
                )}
              >
                {isDone ? <CheckIcon className="size-3" /> : isCurrent ? <Loader2Icon className="size-3 animate-spin" /> : index + 1}
              </span>
              <span className={cn(isDone || isCurrent ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
