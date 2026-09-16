"use client";

import { ImageIcon, Loader2Icon, PencilIcon, UserRoundIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type EditorScene = {
  id: string;
  scene_index: number;
  title: string;
  start_time: number;
  end_time: number;
  has_avatar_clip: boolean;
  avatar_clip_url: string | null;
  avatar_clip_duration_seconds: number | null;
  b_roll_type: string | null;
  b_roll_url: string | null;
  illustration_data: { code?: string } | null;
  visual_prompt: string | null;
  voiceover_segment: string;
  caption_text: string;
  status: "pending" | "processing" | "completed" | "failed";
};

export function SceneCard({
  scene,
  isGenerating,
  onEdit,
}: {
  scene: EditorScene;
  isGenerating: boolean;
  onEdit: () => void;
}) {
  const durationSeconds = Math.max(0, scene.end_time - scene.start_time);
  const thumbnailUrl = scene.avatar_clip_url ?? (scene.b_roll_type !== "ai_illustration" ? scene.b_roll_url : null);
  const isIllustration = scene.b_roll_type === "ai_illustration";

  return (
    <div className="flex w-56 shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-xs">
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {thumbnailUrl ? (
          scene.avatar_clip_url === thumbnailUrl ? (
            <video className="size-full object-cover" muted src={thumbnailUrl} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={scene.title} className="size-full object-cover" src={thumbnailUrl} />
          )
        ) : (
          <div className="flex size-full items-center justify-center">
            {isIllustration ? (
              <span className="text-xs font-medium text-muted-foreground">Illustration</span>
            ) : (
              <ImageIcon className="size-6 text-muted-foreground" />
            )}
          </div>
        )}

        {scene.has_avatar_clip ? (
          <Badge className="absolute top-1.5 left-1.5 gap-1" variant="secondary">
            <UserRoundIcon className="size-3" />
            Avatar
          </Badge>
        ) : null}

        {isGenerating ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/60 text-white">
            <Loader2Icon className="size-5 animate-spin" />
            <span className="text-xs font-medium">Generating…</span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">Scene {scene.scene_index + 1}</span>
          <Badge variant="outline">{durationSeconds.toFixed(1)}s</Badge>
        </div>
        <p className={cn("truncate text-xs text-muted-foreground", scene.status === "failed" && "text-destructive")}>
          {scene.status === "failed" ? "Generation failed" : scene.title}
        </p>
        <Button className="mt-1 w-full" disabled={isGenerating} onClick={onEdit} size="sm" variant="outline">
          <PencilIcon />
          Edit
        </Button>
      </div>
    </div>
  );
}
