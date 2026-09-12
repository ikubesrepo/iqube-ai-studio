"use client";

import { useRef, useState } from "react";
import { Loader2Icon, MicIcon, PauseIcon, PlayIcon } from "lucide-react";

import { deleteVoiceCloneAction } from "@/app/actions/voice-cloning";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/dashboard/voice-cloning/confirm-delete-dialog";
import { gradientForName } from "@/lib/dashboard/voice-cloning/gradient";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<string, { label: string; variant: "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Queued", variant: "secondary" },
  processing: { label: "Processing", variant: "secondary" },
  completed: { label: "Ready", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
};

export type VoiceCardData = {
  id: string;
  name: string;
  type: "Custom" | "Default";
  status?: "pending" | "processing" | "completed" | "failed";
  previewAudioUrl: string | null;
  description?: string;
};

export function VoiceCard({
  voice,
  onUse,
  onPreviewRequested,
  useLabel = "Use for TTS",
  selected = false,
}: {
  voice: VoiceCardData;
  onUse?: (voice: VoiceCardData) => void;
  onPreviewRequested?: (voice: VoiceCardData) => Promise<string | null>;
  useLabel?: string;
  selected?: boolean;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedUrlRef = useRef<string | null>(null);

  const statusBadge = voice.status ? STATUS_BADGE[voice.status] : null;
  const isUsable = voice.type === "Default" || voice.status === "completed";

  async function handlePreview() {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
      return;
    }

    let url = voice.previewAudioUrl;

    if (!url && onPreviewRequested) {
      setIsLoadingPreview(true);
      try {
        url = await onPreviewRequested(voice);
      } finally {
        setIsLoadingPreview(false);
      }
    }

    if (!url) return;

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener("ended", () => setIsPlaying(false));
    }

    // Only reassign `src` when the URL actually changed -- setting it again
    // (even to the same value) reloads the element and resets playback to
    // 0, which broke resuming from a paused position.
    if (loadedUrlRef.current !== url) {
      audioRef.current.src = url;
      loadedUrlRef.current = url;
    }

    audioRef.current.play();
    setIsPlaying(true);
  }

  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 overflow-hidden rounded-[calc(var(--radius)*1.5)] border bg-card p-4 shadow-xs transition-all duration-200 hover:border-primary/50 hover:shadow-[0_20px_45px_-30px_rgba(15,124,255,0.45)]",
        selected ? "border-primary ring-2 ring-primary/30" : "border-border/60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br",
            gradientForName(voice.name),
          )}
        >
          <MicIcon className="size-5 text-white" />
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={voice.type === "Custom" ? "secondary" : "outline"}>{voice.type}</Badge>
          {statusBadge ? <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge> : null}
        </div>
      </div>

      <div>
        <p className="truncate text-sm font-semibold text-foreground">{voice.name}</p>
        <p className="text-xs text-muted-foreground">
          {voice.description ?? (voice.type === "Custom" ? "Your cloned voice" : "Deepgram default voice")}
        </p>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <Button
          className="flex-1"
          disabled={isLoadingPreview || (!voice.previewAudioUrl && !onPreviewRequested)}
          onClick={handlePreview}
          size="sm"
          variant="outline"
        >
          {isLoadingPreview ? <Loader2Icon className="animate-spin" /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
          {isPlaying ? "Pause" : "Play Preview"}
        </Button>
        <Button className="flex-1" disabled={!isUsable} onClick={() => onUse?.(voice)} size="sm" variant={selected ? "secondary" : "default"}>
          {selected ? "Selected" : useLabel}
        </Button>
        {voice.type === "Custom" ? (
          <ConfirmDeleteDialog
            description={`Delete "${voice.name}"? This can't be undone.`}
            onConfirm={async () => {
              const formData = new FormData();
              formData.set("voiceCloneId", voice.id);
              await deleteVoiceCloneAction(formData);
            }}
            title="Delete voice clone?"
          />
        ) : null}
      </div>
    </div>
  );
}
