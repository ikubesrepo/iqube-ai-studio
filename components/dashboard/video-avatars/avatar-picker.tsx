"use client";

import { CheckIcon, SparklesIcon, UserRoundIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STYLE_LABELS: Record<string, string> = {
  podcast: "Podcast",
  casual: "Casual",
  "3d_cartoon": "3D Cartoon",
  stylized: "Stylized",
};

export type PickableAvatar = {
  id: string;
  source: string;
  style: string | null;
  crop_16_9_url: string | null;
  crop_9_16_url: string | null;
};

export function AvatarPicker({
  avatars,
  selectedId,
  onSelect,
  aspectRatio,
}: {
  avatars: PickableAvatar[];
  selectedId: string | null;
  onSelect: (avatar: PickableAvatar) => void;
  aspectRatio: "16:9" | "9:16";
}) {
  if (avatars.length === 0) {
    return (
      <div className="rounded-[calc(var(--radius)*1.5)] border border-dashed border-border/60 bg-card/40 p-6 text-center text-sm text-muted-foreground">
        You don&apos;t have any completed avatars yet.{" "}
        <a className="font-medium text-primary underline underline-offset-3" href="/dashboard/avatar">
          Create one first
        </a>
        .
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {avatars.map((avatar) => {
        const previewUrl = aspectRatio === "16:9" ? avatar.crop_16_9_url : avatar.crop_9_16_url;
        const hasRatio = Boolean(previewUrl);
        const isSelected = selectedId === avatar.id;
        const styleLabel = avatar.style ? STYLE_LABELS[avatar.style] || avatar.style : avatar.source === "default" ? "Default" : "Avatar";

        return (
          <button
            className={cn(
              "group relative overflow-hidden rounded-xl border-2 bg-card text-left shadow-xs transition-all",
              isSelected ? "border-primary ring-2 ring-primary/30" : "border-border/60 hover:border-primary/50",
              !hasRatio && "opacity-40",
            )}
            disabled={!hasRatio}
            key={avatar.id}
            onClick={() => onSelect(avatar)}
            title={!hasRatio ? `No ${aspectRatio} version for this avatar` : undefined}
            type="button"
          >
            <div className="relative aspect-square w-full overflow-hidden bg-muted">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt={styleLabel} className="size-full object-cover" src={previewUrl} />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <UserRoundIcon className="size-6 text-muted-foreground" />
                </div>
              )}
              {isSelected ? (
                <span className="absolute inset-0 flex items-center justify-center bg-primary/20">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <CheckIcon className="size-4" />
                  </span>
                </span>
              ) : null}
              {avatar.source === "ai" ? (
                <Badge className="absolute top-1.5 left-1.5 gap-1" variant="secondary">
                  <SparklesIcon className="size-3" />
                </Badge>
              ) : null}
            </div>
            <p className="truncate px-1.5 py-1.5 text-xs font-medium text-foreground">{styleLabel}</p>
          </button>
        );
      })}
    </div>
  );
}
