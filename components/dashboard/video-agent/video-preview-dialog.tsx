"use client";

import { useTransition } from "react";
import { Loader2Icon, SparklesIcon } from "lucide-react";

import { renderVideoAgentAction } from "@/app/actions/video-agent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { RemotionPlayerClient } from "@/components/dashboard/video-agent/remotion-player-client";
import type { VideoAgentCompositionProps } from "@/remotion/types";

export function VideoPreviewDialog({
  open,
  onOpenChange,
  title,
  compositionData,
  fallbackVideoUrl,
  projectId,
  status,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  compositionData: VideoAgentCompositionProps | null;
  fallbackVideoUrl: string | null;
  projectId?: string;
  status?: string;
}) {
  const [isRendering, startRender] = useTransition();

  function handleRender() {
    if (!projectId) return;

    startRender(async () => {
      try {
        await renderVideoAgentAction(projectId);
        toast.add({ type: "success", title: "Render started", description: "Check back shortly for the finished video." });
        onOpenChange(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
        toast.add({ type: "error", title: "Couldn't start render", description: message });
      }
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {compositionData ? (
          <RemotionPlayerClient compositionData={compositionData} />
        ) : fallbackVideoUrl ? (
          <video className="w-full rounded-lg bg-black" controls src={fallbackVideoUrl} />
        ) : (
          <p className="text-sm text-muted-foreground">Preview not available yet.</p>
        )}
        {status === "awaiting_render" && projectId ? (
          <DialogFooter>
            <Button disabled={isRendering} onClick={handleRender}>
              {isRendering ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              Render Final Video
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
