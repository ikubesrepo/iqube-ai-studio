"use client";

import { useState, useTransition } from "react";
import { ClockIcon, CoinsIcon, DownloadIcon, InfoIcon, Loader2Icon, PlayIcon, Trash2Icon } from "lucide-react";

import { deleteVideoAgentProjectAction, getVideoAgentProjectStatusAction } from "@/app/actions/video-agent";
import { VideoPreviewDialog } from "@/components/dashboard/video-agent/video-preview-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { B_ROLL_STYLE_INFO, type BRollStyle } from "@/lib/dashboard/video-agent/pricing";
import type { VideoAgentCompositionProps } from "@/remotion/types";

const STATUS_BADGE: Record<string, { label: string; variant: "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Queued", variant: "secondary" },
  processing: { label: "Processing", variant: "secondary" },
  awaiting_render: { label: "Ready to Render", variant: "secondary" },
  completed: { label: "Completed", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
};

export type ProjectCardData = {
  id: string;
  title: string;
  avatar_label: string;
  voice_label: string;
  aspect_ratio: "16:9" | "9:16";
  duration_seconds: number;
  b_roll_style: BRollStyle;
  credits_charged: number;
  status: "pending" | "processing" | "awaiting_render" | "completed" | "failed";
  error_message: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
};

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/40 px-2.5 py-1 text-xs font-medium text-foreground">
      {children}
    </span>
  );
}

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [compositionData, setCompositionData] = useState<VideoAgentCompositionProps | null>(null);
  const [isLoadingPreview, startLoadingPreview] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  const statusBadge = STATUS_BADGE[project.status] ?? STATUS_BADGE.pending;
  const subtitle = `${project.avatar_label} avatar with ${project.voice_label}`;
  // A completed project previews its rendered MP4; an awaiting_render one
  // can still preview the live composition (avatar/B-roll/narration) via
  // the Player, even though no video file exists yet.
  const canPreview = (project.status === "completed" && Boolean(project.video_url)) || project.status === "awaiting_render";
  const createdLabel = new Date(project.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  function handleOpenPreview() {
    setPreviewOpen(true);
    startLoadingPreview(async () => {
      try {
        const data = await getVideoAgentProjectStatusAction(project.id);
        if (data?.composition_data) {
          setCompositionData(data.composition_data as VideoAgentCompositionProps);
        }
      } catch {
        // Fall back to the plain <video> element inside the dialog.
      }
    });
  }

  function handleDelete() {
    startDelete(async () => {
      try {
        const formData = new FormData();
        formData.set("projectId", project.id);
        await deleteVideoAgentProjectAction(formData);
        setDetailsOpen(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
        toast.add({ type: "error", title: "Couldn't delete", description: message });
      }
    });
  }

  return (
    <>
      <div className="group relative flex flex-col overflow-hidden rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-card shadow-xs transition-all duration-200 hover:border-primary/50 hover:shadow-[0_20px_45px_-30px_rgba(15,124,255,0.45)]">
        <div className="absolute top-2 left-2 z-10">
          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
        </div>
        <div className="absolute top-2 right-2 z-10">
          <Badge variant="secondary">{project.aspect_ratio}</Badge>
        </div>

        <button
          className={`relative w-full overflow-hidden bg-muted ${project.aspect_ratio === "9:16" ? "aspect-[9/16]" : "aspect-[16/9]"}`}
          disabled={!canPreview}
          onClick={handleOpenPreview}
          type="button"
        >
          {project.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={project.title} className="size-full object-cover" src={project.thumbnail_url} />
          ) : (
            <div className="flex size-full items-center justify-center bg-muted" />
          )}
          {canPreview ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
              <PlayIcon className="size-9 text-white opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
          ) : null}
        </button>

        <div className="flex flex-1 flex-col gap-2.5 p-4">
          <div>
            <p className="truncate text-sm font-semibold text-foreground">{project.title}</p>
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Chip>
              <ClockIcon className="size-3" />
              {project.duration_seconds}s
            </Chip>
            <Chip>
              <CoinsIcon className="size-3" />
              {project.credits_charged} credits
            </Chip>
            <Chip>{B_ROLL_STYLE_INFO[project.b_roll_style].label}</Chip>
            <Chip>{createdLabel}</Chip>
          </div>

          {project.status === "failed" && project.error_message ? (
            <p className="text-xs text-destructive">{project.error_message}</p>
          ) : null}

          <div className="mt-1 flex items-center gap-2">
            <Button className="flex-1" disabled={!canPreview} onClick={handleOpenPreview} size="sm" variant="outline">
              <PlayIcon />
              Preview
            </Button>
            <Button
              disabled={project.status !== "completed" || !project.video_url}
              nativeButton={false}
              render={<a download href={project.video_url ?? undefined} />}
              size="icon-sm"
              title="Download"
              variant="outline"
            >
              <DownloadIcon />
            </Button>
            <Button onClick={() => setDetailsOpen(true)} size="icon-sm" title="Details" variant="outline">
              <InfoIcon />
            </Button>
          </div>
        </div>
      </div>

      <VideoPreviewDialog
        compositionData={isLoadingPreview ? null : compositionData}
        fallbackVideoUrl={project.video_url}
        onOpenChange={setPreviewOpen}
        open={previewOpen}
        projectId={project.id}
        status={project.status}
        title={project.title}
      />

      <Dialog onOpenChange={setDetailsOpen} open={detailsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{project.title}</DialogTitle>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Avatar</dt>
            <dd className="text-right font-medium text-foreground">{project.avatar_label}</dd>
            <dt className="text-muted-foreground">Voice</dt>
            <dd className="text-right font-medium text-foreground">{project.voice_label}</dd>
            <dt className="text-muted-foreground">B-roll style</dt>
            <dd className="text-right font-medium text-foreground">{B_ROLL_STYLE_INFO[project.b_roll_style].label}</dd>
            <dt className="text-muted-foreground">Screen size</dt>
            <dd className="text-right font-medium text-foreground">{project.aspect_ratio}</dd>
            <dt className="text-muted-foreground">Duration</dt>
            <dd className="text-right font-medium text-foreground">{project.duration_seconds}s</dd>
            <dt className="text-muted-foreground">Credits used</dt>
            <dd className="text-right font-medium text-foreground">{project.credits_charged}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-right font-medium text-foreground">{statusBadge.label}</dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd className="text-right font-medium text-foreground">{createdLabel}</dd>
          </dl>

          {project.status === "failed" && project.error_message ? (
            <p className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">{project.error_message}</p>
          ) : null}

          <div className="flex items-center justify-between border-t border-border/60 pt-4">
            <AlertDialog>
              <AlertDialogTrigger render={<Button size="sm" variant="outline" />}>
                <Trash2Icon className="text-destructive" />
                Delete
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete video?</AlertDialogTitle>
                  <AlertDialogDescription>Delete &quot;{project.title}&quot;? This can&apos;t be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction disabled={isDeleting} onClick={handleDelete} variant="destructive">
                    {isDeleting ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {project.video_url ? (
              <Button nativeButton={false} render={<a download href={project.video_url} />} size="sm" variant="outline">
                <DownloadIcon />
                Download
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
