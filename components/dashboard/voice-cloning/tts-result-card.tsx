"use client";

import { deleteTtsGenerationAction } from "@/app/actions/voice-cloning";
import { Badge } from "@/components/ui/badge";
import { ConfirmDeleteDialog } from "@/components/dashboard/voice-cloning/confirm-delete-dialog";

const STATUS_BADGE: Record<string, { label: string; variant: "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Queued", variant: "secondary" },
  processing: { label: "Processing", variant: "secondary" },
  completed: { label: "Ready", variant: "outline" },
  failed: { label: "Failed", variant: "destructive" },
};

export type TtsResultData = {
  id: string;
  voice_label: string;
  input_text: string;
  credits_charged: number;
  status: "pending" | "processing" | "completed" | "failed";
  error_message: string | null;
  audio_url: string | null;
};

export function TtsResultCard({ result }: { result: TtsResultData }) {
  const statusBadge = STATUS_BADGE[result.status] ?? STATUS_BADGE.pending;
  const truncatedText = result.input_text.length > 180 ? `${result.input_text.slice(0, 180)}…` : result.input_text;

  return (
    <div className="flex flex-col gap-3 rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-card p-4 shadow-xs transition-all duration-200 hover:border-primary/50">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{result.voice_label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{truncatedText}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
          <Badge variant="outline">{result.credits_charged} credits</Badge>
        </div>
      </div>

      {result.status === "completed" && result.audio_url ? (
        <audio className="w-full" controls src={result.audio_url} />
      ) : result.status === "failed" ? (
        <p className="text-xs text-destructive">{result.error_message || "This generation failed."}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Generating audio…</p>
      )}

      <div className="flex justify-end">
        <ConfirmDeleteDialog
          description="Delete this generated audio? This can't be undone."
          onConfirm={async () => {
            const formData = new FormData();
            formData.set("ttsGenerationId", result.id);
            await deleteTtsGenerationAction(formData);
          }}
          title="Delete generated audio?"
        />
      </div>
    </div>
  );
}
