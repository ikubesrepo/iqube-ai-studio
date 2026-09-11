"use client";

import { useState, useTransition } from "react";
import { EyeIcon, Loader2Icon, SparklesIcon, Trash2Icon } from "lucide-react";

import { deleteAvatarAction, setActiveAvatarAction } from "@/app/actions/avatars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type CustomAvatar = {
  id: string;
  source: string;
  style: string | null;
  prompt: string | null;
  status: string;
  error_message: string | null;
  source_image_url: string | null;
  crop_16_9_url: string | null;
  crop_9_16_url: string | null;
  is_active: boolean;
  preferred_ratio: string | null;
};

function RatioRadio({ checked, disabled, onClick }: { checked: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      aria-label={checked ? "Selected" : "Use this ratio"}
      aria-pressed={checked}
      className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full border-2 border-white/80 bg-black/30 backdrop-blur-sm transition-colors disabled:pointer-events-none disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {checked ? <span className="size-2.5 rounded-full bg-primary" /> : null}
    </button>
  );
}

const STYLE_LABELS: Record<string, string> = {
  podcast: "Podcast",
  casual: "Casual",
  "3d_cartoon": "3D Cartoon",
  stylized: "Stylized",
};

const STATUS_BADGE: Record<string, { label: string; variant: "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Queued", variant: "secondary" },
  processing: { label: "Processing", variant: "secondary" },
  completed: { label: "Ready", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
};

export function CustomAvatarCard({ avatar }: { avatar: CustomAvatar }) {
  const [isPending, startTransition] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(false);

  const styleLabel = avatar.style ? STYLE_LABELS[avatar.style] || avatar.style : avatar.source === "upload" ? "Uploaded" : "Avatar";
  const statusBadge = STATUS_BADGE[avatar.status] ?? STATUS_BADGE.pending;
  const hasBothCrops = Boolean(avatar.crop_16_9_url && avatar.crop_9_16_url);
  const singleCropUrl = !hasBothCrops ? avatar.crop_16_9_url || avatar.crop_9_16_url : null;
  const singleCropRatio: "16:9" | "9:16" | null = !hasBothCrops
    ? avatar.crop_16_9_url
      ? "16:9"
      : avatar.crop_9_16_url
        ? "9:16"
        : null
    : null;
  const singlePreview = singleCropUrl || avatar.source_image_url;

  function handleUseAvatar(ratio?: "16:9" | "9:16") {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("avatarId", avatar.id);
      if (ratio) formData.set("ratio", ratio);
      await setActiveAvatarAction(formData);
    });
  }

  function handleDelete() {
    if (!window.confirm("Delete this avatar? This can't be undone.")) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("avatarId", avatar.id);
      await deleteAvatarAction(formData);
    });
  }

  return (
    <>
      <div className="group relative overflow-hidden rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-card shadow-xs transition-all duration-200 hover:border-primary/50 hover:shadow-[0_20px_45px_-30px_rgba(15,124,255,0.45)]">
        <div className="absolute top-2 left-2 z-10 flex gap-1.5">
          {avatar.source === "ai" ? (
            <Badge className="gap-1" variant="secondary">
              <SparklesIcon className="size-3" />
              AI
            </Badge>
          ) : null}
          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
        </div>

        {hasBothCrops ? (
          <div className="grid grid-cols-[1.6fr_1fr] items-start gap-2 p-2">
            <div className="relative mx-auto aspect-[16/9] w-full max-w-[85%] self-center overflow-hidden rounded-lg bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="16:9 preview" className="size-full object-cover" src={avatar.crop_16_9_url!} />
              <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                16:9
              </span>
              <RatioRadio
                checked={avatar.is_active && avatar.preferred_ratio === "16:9"}
                disabled={isPending || avatar.status !== "completed"}
                onClick={() => handleUseAvatar("16:9")}
              />
            </div>
            <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="9:16 preview" className="size-full object-cover" src={avatar.crop_9_16_url!} />
              <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                9:16
              </span>
              <RatioRadio
                checked={avatar.is_active && avatar.preferred_ratio === "9:16"}
                disabled={isPending || avatar.status !== "completed"}
                onClick={() => handleUseAvatar("9:16")}
              />
            </div>
          </div>
        ) : (
          <div
            className={`relative w-full overflow-hidden bg-muted ${singleCropRatio === "9:16" ? "aspect-[9/16]" : singleCropRatio === "16:9" ? "aspect-[16/9]" : "aspect-[4/3]"}`}
          >
            {singlePreview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={styleLabel}
                  className="size-full object-cover object-[50%_15%] transition-[object-position] duration-700 group-hover:object-[50%_85%]"
                  src={singlePreview}
                />
                {singleCropRatio ? (
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {singleCropRatio}
                  </span>
                ) : null}
              </>
            ) : (
              <div className="flex size-full items-center justify-center">
                <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        )}

        <div className="p-3">
          <p className="truncate text-sm font-semibold text-foreground">{styleLabel} avatar</p>
          <p className="truncate text-xs text-muted-foreground">{styleLabel}</p>

          <div className="mt-3 flex items-center gap-2">
            <Button
              className="flex-1"
              disabled={avatar.is_active || isPending || avatar.status !== "completed"}
              onClick={() => handleUseAvatar()}
              size="sm"
              variant={avatar.is_active ? "secondary" : "default"}
            >
              {avatar.is_active ? "Selected" : "Use avatar"}
            </Button>
            <Button
              disabled={!singlePreview}
              onClick={() => setPreviewOpen(true)}
              size="icon-sm"
              title="Preview"
              variant="outline"
            >
              <EyeIcon />
            </Button>
            <Button disabled={isPending} onClick={handleDelete} size="icon-sm" title="Delete" variant="outline">
              <Trash2Icon className="text-destructive" />
            </Button>
          </div>

          {avatar.status === "failed" && avatar.error_message ? (
            <p className="mt-2 text-xs text-destructive">{avatar.error_message}</p>
          ) : null}
        </div>
      </div>

      <Dialog onOpenChange={setPreviewOpen} open={previewOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{styleLabel} avatar</DialogTitle>
            {avatar.prompt ? <DialogDescription>{avatar.prompt}</DialogDescription> : null}
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {avatar.crop_16_9_url ? (
              <div>
                <div className="aspect-[16/9] overflow-hidden rounded-lg bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="16:9 preview" className="size-full object-cover" src={avatar.crop_16_9_url} />
                </div>
                <p className="mt-1.5 text-xs font-medium text-muted-foreground">16:9 ratio</p>
              </div>
            ) : null}
            {avatar.crop_9_16_url ? (
              <div>
                <div className="aspect-[9/16] overflow-hidden rounded-lg bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="9:16 preview" className="size-full object-cover" src={avatar.crop_9_16_url} />
                </div>
                <p className="mt-1.5 text-xs font-medium text-muted-foreground">9:16 ratio</p>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
