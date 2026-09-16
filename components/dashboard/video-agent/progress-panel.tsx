"use client";

import { CheckIcon, Loader2Icon } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// Must stay byte-identical to the STEPS labels set via metadata.set("progress", ...)
// in src/trigger/generate-video-agent.ts.
export const STEP_LABELS = [
  "Preparing script",
  "Breaking script into scenes",
  "Generating prompts",
  "Generating avatar clips",
  "Generating voiceover",
  "Generating captions",
  "Fetching or generating B-roll",
  "Creating Remotion composition",
  "Saving assets",
  "Ready for preview",
] as const;

// Must stay byte-identical to the STEPS labels set via metadata.set("progress", ...)
// in src/trigger/render-video-agent.ts.
export const RENDER_STEP_LABELS = ["Loading composition", "Rendering final video", "Uploading video", "Completed"] as const;

export function ProgressPanel({
  step,
  percentage,
  steps = STEP_LABELS,
}: {
  step?: string;
  percentage: number;
  steps?: readonly string[];
}) {
  const currentIndex = step ? steps.indexOf(step) : -1;

  return (
    <div className="space-y-4">
      <Progress value={percentage} />
      <ol className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {steps.map((label, index) => {
          const isDone = currentIndex > index || (currentIndex === steps.length - 1 && index === currentIndex);
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
