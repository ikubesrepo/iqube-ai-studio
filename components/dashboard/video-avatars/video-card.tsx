"use client";

import { useState, useTransition } from "react";
import {
  ClockIcon,
  CoinsIcon,
  DownloadIcon,
  FilmIcon,
  InfoIcon,
  Loader2Icon,
  PlayIcon,
  Trash2Icon,
} from "lucide-react";

import { deleteAvatarVideoAction } from "@/app/actions/video-avatars";
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

const STATUS_BADGE: Record<string, { label: string; variant: "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Queued", variant: "secondary" },
  processing: { label: "Processing", variant: "secondary" },
  completed: { label: "Completed", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
};

export type VideoCardData = {
  id: string;
  title: string | null;
  avatar_label: string;
  voice_label: string;
  aspect_ratio: "16:9" | "9:16";
  duration_seconds: number;
  credits_charged: number;
  status: "pending" | "processing" | "completed" | "failed";
  error_message: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  created_at: string;
};

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/40 px-2.5 py-1 text-xs font-medium text-foreground">
      {icon}
      {children}
    </span>
  );
}

export function VideoCard({ video }: { video: VideoCardData }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  const statusBadge = STATUS_BADGE[video.status] ?? STATUS_BADGE.pending;
  const title = video.title || `${video.avatar_label} Avatar`;
  const subtitle = `${video.avatar_label} avatar with ${video.voice_label}`;
  const createdLabel = new Date(video.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  function handleDelete() {
    startDelete(async () => {
      try {
        const formData = new FormData();
        formData.set("avatarVideoId", video.id);
        await deleteAvatarVideoAction(formData);
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
          <Badge variant="secondary">{video.aspect_ratio}</Badge>
        </div>

        <button
          className={`relative w-full overflow-hidden bg-muted ${video.aspect_ratio === "9:16" ? "aspect-[9/16]" : "aspect-[16/9]"}`}
          disabled={video.status !== "completed" || !video.video_url}
          onClick={() => setPreviewOpen(true)}
          type="button"
        >
          {video.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={title} className="size-full object-cover" src={video.thumbnail_url} />
          ) : (
            <div className="flex size-full items-center justify-center">
              <FilmIcon className="size-8 text-muted-foreground" />
            </div>
          )}
          {video.status === "completed" && video.video_url ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
              <PlayIcon className="size-9 text-white opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
          ) : null}
        </button>

        <div className="flex flex-1 flex-col gap-2.5 p-4">
          <div>
            <p className="truncate text-sm font-semibold text-foreground">{title}</p>
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Chip icon={<ClockIcon className="size-3" />}>{video.duration_seconds}s</Chip>
            <Chip icon={<CoinsIcon className="size-3" />}>{video.credits_charged} credits</Chip>
            <Chip icon={null}>{createdLabel}</Chip>
          </div>

          {video.status === "failed" && video.error_message ? (
            <p className="text-xs text-destructive">{video.error_message}</p>
          ) : null}

          <div className="mt-1 flex items-center gap-2">
            <Button
              className="flex-1"
              disabled={video.status !== "completed" || !video.video_url}
              onClick={() => setPreviewOpen(true)}
              size="sm"
              variant="outline"
            >
              <PlayIcon />
              Preview
            </Button>
            <Button
              disabled={video.status !== "completed" || !video.video_url}
              nativeButton={false}
              render={<a download href={video.video_url ?? undefined} />}
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

      <Dialog onOpenChange={setPreviewOpen} open={previewOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {video.video_url ? <video className="w-full rounded-lg bg-black" controls src={video.video_url} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setDetailsOpen} open={detailsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Avatar</dt>
            <dd className="text-right font-medium text-foreground">{video.avatar_label}</dd>
            <dt className="text-muted-foreground">Voice</dt>
            <dd className="text-right font-medium text-foreground">{video.voice_label}</dd>
            <dt className="text-muted-foreground">Screen size</dt>
            <dd className="text-right font-medium text-foreground">{video.aspect_ratio}</dd>
            <dt className="text-muted-foreground">Duration</dt>
            <dd className="text-right font-medium text-foreground">{video.duration_seconds}s</dd>
            <dt className="text-muted-foreground">Credits used</dt>
            <dd className="text-right font-medium text-foreground">{video.credits_charged}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="text-right font-medium text-foreground">{statusBadge.label}</dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd className="text-right font-medium text-foreground">{createdLabel}</dd>
          </dl>

          {video.status === "failed" && video.error_message ? (
            <p className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">{video.error_message}</p>
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
                  <AlertDialogDescription>Delete &quot;{title}&quot;? This can&apos;t be undone.</AlertDialogDescription>
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

            {video.video_url ? (
              <Button nativeButton={false} render={<a download href={video.video_url} />} size="sm" variant="outline">
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
