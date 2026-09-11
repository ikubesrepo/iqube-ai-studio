"use client";

import { useEffect, useState, useTransition } from "react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { Loader2Icon, PlusIcon, RefreshCwIcon, SparklesIcon, UploadIcon } from "lucide-react";

import { generateAvatarAction, getAvatarStatusAction, uploadAvatarAction, type AvatarStyle } from "@/app/actions/avatars";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cropImageToAspectRatios } from "@/lib/dashboard/crop-image";

const STYLE_OPTIONS: { value: AvatarStyle; label: string }[] = [
  { value: "podcast", label: "Podcast" },
  { value: "casual", label: "Casual" },
  { value: "3d_cartoon", label: "3D Cartoon" },
  { value: "stylized", label: "Stylized" },
];

const RATIO_OPTIONS = [
  { value: "16:9", label: "16:9 ratio", description: "Landscape preview" },
  { value: "9:16", label: "9:16 ratio", description: "Portrait preview" },
] as const;

const TERMINAL_FAILURE_STATUSES = new Set(["FAILED", "CRASHED", "SYSTEM_FAILURE", "TIMED_OUT", "EXPIRED", "CANCELED"]);

type Status = "idle" | "generating" | "completed" | "failed";

type ResultData = {
  crop_16_9_url: string | null;
  crop_9_16_url: string | null;
};

export function CreateAvatarDialog() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [style, setStyle] = useState<AvatarStyle>(STYLE_OPTIONS[0].value);
  const [ratios, setRatios] = useState<string[]>(["16:9", "9:16"]);
  const [prompt, setPrompt] = useState("");
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const { run } = useRealtimeRun(runId ?? undefined, {
    accessToken: publicToken ?? undefined,
    enabled: Boolean(runId && publicToken),
  });

  useEffect(() => {
    if (!run || !avatarId) return;

    if (run.status === "COMPLETED") {
      getAvatarStatusAction(avatarId)
        .then((data) => {
          setResult({ crop_16_9_url: data.crop_16_9_url, crop_9_16_url: data.crop_9_16_url });
          setStatus("completed");
        })
        .catch((err) => {
          setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
          setStatus("failed");
        });
    } else if (TERMINAL_FAILURE_STATUSES.has(run.status)) {
      getAvatarStatusAction(avatarId)
        .then((data) => {
          setErrorMessage(data.error_message || "Generation failed. Please try again.");
        })
        .catch(() => {
          setErrorMessage("Generation failed. Please try again.");
        })
        .finally(() => setStatus("failed"));
    }
  }, [run, avatarId]);

  function resetState() {
    setStatus("idle");
    setFile(null);
    setPreviewUrl(null);
    setStyle(STYLE_OPTIONS[0].value);
    setRatios(["16:9", "9:16"]);
    setPrompt("");
    setAvatarId(null);
    setRunId(null);
    setPublicToken(null);
    setResult(null);
    setErrorMessage(null);
  }

  function handleFileChange(selected: File | null) {
    setFile(selected);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : null);
  }

  function startGeneration() {
    if (ratios.length === 0) return;

    startSubmit(async () => {
      setErrorMessage(null);
      const formData = new FormData();
      formData.set("style", style);
      formData.set("prompt", prompt);
      if (file) formData.set("sourceImage", file);
      ratios.forEach((ratio) => formData.append("ratios", ratio));

      try {
        const { avatarId: newAvatarId, runId: newRunId, publicToken: newToken } = await generateAvatarAction(formData);
        setResult(null);
        setAvatarId(newAvatarId);
        setRunId(newRunId);
        setPublicToken(newToken);
        setStatus("generating");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to start generation");
        setStatus("failed");
      }
    });
  }

  function handleUploadAsIs() {
    if (!file) return;

    startSubmit(async () => {
      try {
        const { original, crop16x9, crop9x16 } = await cropImageToAspectRatios(file);
        const formData = new FormData();
        formData.set("original", original);
        formData.set("crop16x9", crop16x9, "crop16x9.png");
        formData.set("crop9x16", crop9x16, "crop9x16.png");
        await uploadAvatarAction(formData);
        setOpen(false);
        resetState();
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to upload avatar");
        setStatus("failed");
      }
    });
  }

  const progress = run?.metadata?.progress as { step: string; percentage: number } | undefined;
  const isBusy = isSubmitting || status === "generating";

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetState();
      }}
      open={open}
    >
      <DialogTrigger render={<Button size="lg" />}>
        <PlusIcon />
        Create New Avatar
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create New Avatar</DialogTitle>
          <DialogDescription>Upload a reference image, choose a style, then generate AI variants or save the image unchanged.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-5">
            <div>
              <Label htmlFor="avatar-upload">Avatar image</Label>
              <label
                className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/70 bg-accent/30 p-6 text-center transition hover:bg-accent/50"
                htmlFor="avatar-upload"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const dropped = event.dataTransfer.files?.[0];
                  if (dropped) handleFileChange(dropped);
                }}
              >
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="Selected preview" className="h-28 w-28 rounded-lg object-cover" src={previewUrl} />
                ) : (
                  <UploadIcon className="size-6 text-muted-foreground" />
                )}
                <span className="text-sm text-muted-foreground">
                  {file ? file.name : "Drag & drop, or click to choose an image"}
                </span>
                <input
                  accept="image/*"
                  className="hidden"
                  id="avatar-upload"
                  onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                  type="file"
                />
              </label>
            </div>

            <div>
              <Label htmlFor="avatar-style">Avatar style</Label>
              <Select onValueChange={(value) => setStyle(value as AvatarStyle)} value={style}>
                <SelectTrigger className="mt-2 w-full" id="avatar-style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Aspect ratio</Label>
              <ToggleGroup className="mt-2" multiple onValueChange={setRatios} spacing={0} value={ratios} variant="outline">
                {RATIO_OPTIONS.map((option) => (
                  <ToggleGroupItem className="flex-1" key={option.value} value={option.value}>
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div>
              <Label htmlFor="avatar-prompt">Customization prompt</Label>
              <Textarea
                className="mt-2"
                id="avatar-prompt"
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Optional: outfit, mood, background, lighting..."
                value={prompt}
              />
            </div>
          </div>

          <div className="flex flex-col rounded-xl border border-border/60 bg-accent/20 p-4">
            <p className="text-sm font-semibold text-foreground">Generated avatars</p>
            <p className="mt-1 text-xs text-muted-foreground">Saved to InsForge storage and your avatar library.</p>

            <div className="mt-4 flex flex-1 flex-col justify-center gap-4">
              {status === "idle" ? (
                <p className="text-center text-sm text-muted-foreground">Your generated avatars will appear here.</p>
              ) : null}

              {status === "generating" ? (
                <div className="space-y-3">
                  <Progress value={progress?.percentage ?? 5} />
                  <p className="text-center text-sm text-muted-foreground">
                    {progress?.step ? `Working on ${progress.step}…` : "Starting generation…"}
                  </p>
                </div>
              ) : null}

              {status === "completed" && result ? (
                <div className="grid grid-cols-2 gap-3">
                  {result.crop_16_9_url ? (
                    <div>
                      <div className="aspect-[16/9] overflow-hidden rounded-lg bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="16:9 avatar preview" className="size-full object-cover" src={result.crop_16_9_url} />
                      </div>
                      <p className="mt-1.5 text-xs font-medium text-foreground">16:9 ratio</p>
                      <p className="text-xs text-muted-foreground">Landscape preview</p>
                    </div>
                  ) : null}
                  {result.crop_9_16_url ? (
                    <div>
                      <div className="aspect-[9/16] overflow-hidden rounded-lg bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="9:16 avatar preview" className="size-full object-cover" src={result.crop_9_16_url} />
                      </div>
                      <p className="mt-1.5 text-xs font-medium text-foreground">9:16 ratio</p>
                      <p className="text-xs text-muted-foreground">Portrait preview</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {status === "failed" ? (
                <p className="text-center text-sm text-destructive">{errorMessage || "We couldn't generate your avatar."}</p>
              ) : null}
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {status === "completed" || status === "failed" ? (
            <Button disabled={isBusy} onClick={startGeneration} variant="ghost">
              <RefreshCwIcon />
              Generate New One
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              onClick={() => {
                setOpen(false);
                resetState();
              }}
              variant="outline"
            >
              Close
            </Button>
            <Button disabled={!file || isBusy} onClick={handleUploadAsIs} variant="outline">
              <UploadIcon />
              Upload as It Is
            </Button>
            <Button disabled={isBusy || ratios.length === 0} onClick={startGeneration}>
              {isBusy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              Generate with AI
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
