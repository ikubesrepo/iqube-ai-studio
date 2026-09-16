"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { Loader2Icon, RefreshCwIcon, SparklesIcon, UserRoundIcon } from "lucide-react";

import { generateScriptAction, generateVideoAvatarAction, getAvatarVideoStatusAction } from "@/app/actions/video-avatars";
import { getOrCreateDefaultVoicePreviewAction } from "@/app/actions/voice-cloning";
import { AvatarPicker, type PickableAvatar } from "@/components/dashboard/video-avatars/avatar-picker";
import { ProgressPanel } from "@/components/dashboard/video-avatars/progress-panel";
import { VoiceCard, type VoiceCardData } from "@/components/dashboard/voice-cloning/voice-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DURATION_OPTIONS, computeVideoCreditsCost, type VideoDurationSeconds } from "@/lib/dashboard/video-avatars/pricing";

const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "energetic", label: "Energetic" },
  { value: "educational", label: "Educational" },
  { value: "promotional", label: "Promotional" },
] as const;

const RATIO_OPTIONS = [
  { value: "16:9", label: "16:9 Landscape" },
  { value: "9:16", label: "9:16 Vertical" },
] as const;

const SCRIPT_MAX_LENGTH = 4000;
const TERMINAL_FAILURE_STATUSES = new Set(["FAILED", "CRASHED", "SYSTEM_FAILURE", "TIMED_OUT", "EXPIRED", "CANCELED"]);

type GenerationStatus = "idle" | "generating" | "completed" | "failed";

type ResultData = { video_url: string | null; title: string | null };

export function CreateVideoAvatarForm({
  avatars,
  customVoices,
  defaultVoices,
  creditsBalance,
}: {
  avatars: PickableAvatar[];
  customVoices: VoiceCardData[];
  defaultVoices: VoiceCardData[];
  creditsBalance: number;
}) {
  const [scriptMode, setScriptMode] = useState<"manual" | "ai">("manual");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<(typeof TONE_OPTIONS)[number]["value"]>("professional");
  const [script, setScript] = useState("");
  const [isGeneratingScript, startScriptGeneration] = useTransition();

  const [selectedAvatar, setSelectedAvatar] = useState<PickableAvatar | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<VoiceCardData | null>(null);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [durationSeconds, setDurationSeconds] = useState<VideoDurationSeconds>(10);

  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [avatarVideoId, setAvatarVideoId] = useState<string | null>(null);
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
    if (!run || !avatarVideoId) return;

    if (run.status === "COMPLETED") {
      getAvatarVideoStatusAction(avatarVideoId)
        .then((data) => {
          if (!data) throw new Error("Video not found");
          setResult({ video_url: data.video_url, title: data.title });
          setStatus("completed");
          toast.add({ type: "success", title: "Video ready", description: "Your avatar video finished generating." });
        })
        .catch((err) => {
          setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
          setStatus("failed");
        });
    } else if (TERMINAL_FAILURE_STATUSES.has(run.status)) {
      getAvatarVideoStatusAction(avatarVideoId)
        .then((data) => {
          setErrorMessage(data?.error_message || "Generation failed. Please try again.");
        })
        .catch(() => {
          setErrorMessage("Generation failed. Please try again.");
        })
        .finally(() => setStatus("failed"));
    }
  }, [run, avatarVideoId]);

  // Safety net: the realtime channel can silently miss its final event on
  // long-running tasks (observed: the UI stayed stuck on an in-progress
  // step even though the backend had already finished). Poll the actual DB
  // status independently so completion/failure is still detected even if
  // realtime never delivers it. Whichever path (realtime or poll) resolves
  // first flips `status`, which tears down the other effect via its
  // `cancelled` cleanup before its own in-flight check can double-fire.
  useEffect(() => {
    if (!avatarVideoId || status !== "generating") return;

    let cancelled = false;
    const interval = setInterval(() => {
      getAvatarVideoStatusAction(avatarVideoId)
        .then((data) => {
          if (cancelled || !data) return;
          if (data.status === "completed" && data.video_url) {
            setResult({ video_url: data.video_url, title: data.title });
            setStatus("completed");
            toast.add({ type: "success", title: "Video ready", description: "Your avatar video finished generating." });
          } else if (data.status === "failed") {
            setErrorMessage(data.error_message || "Generation failed. Please try again.");
            setStatus("failed");
          }
        })
        .catch(() => {});
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [avatarVideoId, status]);

  const progress = run?.metadata?.progress as { step: string; percentage: number } | undefined;
  const cost = computeVideoCreditsCost(durationSeconds);
  const insufficientCredits = cost > creditsBalance;
  const trimmedScript = script.trim();

  const canGenerate =
    Boolean(trimmedScript) &&
    trimmedScript.length <= SCRIPT_MAX_LENGTH &&
    Boolean(selectedAvatar) &&
    Boolean(selectedVoice) &&
    !insufficientCredits;

  const previewImage = useMemo(() => {
    if (!selectedAvatar) return null;
    return aspectRatio === "16:9" ? selectedAvatar.crop_16_9_url : selectedAvatar.crop_9_16_url;
  }, [selectedAvatar, aspectRatio]);

  function handleAvatarSelect(avatar: PickableAvatar) {
    setSelectedAvatar(avatar);
  }

  function handleVoicePreview(voice: VoiceCardData) {
    if (voice.type === "Default") {
      return getOrCreateDefaultVoicePreviewAction(voice.id).then((res) => res.url);
    }
    return Promise.resolve(voice.previewAudioUrl);
  }

  function handleGenerateScript() {
    if (!topic.trim()) return;

    startScriptGeneration(async () => {
      try {
        const formData = new FormData();
        formData.set("topic", topic.trim());
        formData.set("tone", tone);
        const { script: generated } = await generateScriptAction(formData);
        setScript(generated);
        setScriptMode("manual");
        toast.add({ type: "success", title: "Script generated", description: "Feel free to edit it before generating." });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to generate script";
        toast.add({ type: "error", title: "Couldn't generate script", description: message });
      }
    });
  }

  function submitGeneration() {
    if (!canGenerate || !selectedAvatar || !selectedVoice) return;

    startSubmit(async () => {
      setErrorMessage(null);
      const formData = new FormData();
      formData.set("script", trimmedScript);
      formData.set("avatarId", selectedAvatar.id);
      formData.set("aspectRatio", aspectRatio);
      formData.set("durationSeconds", String(durationSeconds));
      formData.set("tone", tone);
      if (selectedVoice.type === "Default") {
        formData.set("defaultVoiceId", selectedVoice.id);
      } else {
        formData.set("voiceCloneId", selectedVoice.id);
      }

      try {
        const { avatarVideoId: newId, runId: newRunId, publicToken: newToken } = await generateVideoAvatarAction(formData);
        setResult(null);
        setAvatarVideoId(newId);
        setRunId(newRunId);
        setPublicToken(newToken);
        setStatus("generating");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to start generation";
        setErrorMessage(message);
        toast.add({ type: "error", title: "Couldn't start generation", description: message });
      }
    });
  }

  function generateAnother() {
    setStatus("idle");
    setAvatarVideoId(null);
    setRunId(null);
    setPublicToken(null);
    setResult(null);
    setErrorMessage(null);
  }

  const isBusy = isSubmitting || status === "generating";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <section className="rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-card p-5 shadow-xs">
          <h2 className="font-heading text-base font-semibold tracking-[-0.02em]">Script</h2>
          <Tabs
            className="mt-3"
            onValueChange={(value) => setScriptMode(value as "manual" | "ai")}
            value={scriptMode}
          >
            <TabsList>
              <TabsTrigger value="manual">Write manually</TabsTrigger>
              <TabsTrigger value="ai">Generate with AI</TabsTrigger>
            </TabsList>

            <TabsContent value="ai">
              <div className="mt-3 space-y-3">
                <div>
                  <Label htmlFor="script-topic">Topic</Label>
                  <Input
                    className="mt-2"
                    id="script-topic"
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder="e.g. Announcing our new pricing plans"
                    value={topic}
                  />
                </div>
                <div>
                  <Label htmlFor="script-tone">Tone</Label>
                  <Select onValueChange={(value) => setTone(value as typeof tone)} value={tone}>
                    <SelectTrigger className="mt-2 w-full" id="script-tone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button disabled={!topic.trim() || isGeneratingScript} onClick={handleGenerateScript} variant="outline">
                  {isGeneratingScript ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                  Generate Script
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="video-script">Script</Label>
              <span className={`text-xs ${script.length > SCRIPT_MAX_LENGTH ? "text-destructive" : "text-muted-foreground"}`}>
                {script.length}/{SCRIPT_MAX_LENGTH}
              </span>
            </div>
            <Textarea
              className="mt-2 min-h-32"
              id="video-script"
              maxLength={SCRIPT_MAX_LENGTH}
              onChange={(event) => setScript(event.target.value)}
              placeholder="Write what your avatar should say, or generate a script above…"
              value={script}
            />
          </div>
        </section>

        <section className="rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-card p-5 shadow-xs">
          <h2 className="font-heading text-base font-semibold tracking-[-0.02em]">Avatar</h2>
          <div className="mt-3">
            <AvatarPicker aspectRatio={aspectRatio} avatars={avatars} onSelect={handleAvatarSelect} selectedId={selectedAvatar?.id ?? null} />
          </div>
        </section>

        <section className="rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-card p-5 shadow-xs">
          <h2 className="font-heading text-base font-semibold tracking-[-0.02em]">Voice</h2>
          <div className="mt-3 space-y-4">
            {customVoices.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Your Voices</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {customVoices.map((voice) => (
                    <VoiceCard
                      key={voice.id}
                      onPreviewRequested={handleVoicePreview}
                      onUse={setSelectedVoice}
                      selected={selectedVoice?.id === voice.id}
                      useLabel="Select Voice"
                      voice={voice}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Default Voices</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {defaultVoices.map((voice) => (
                  <VoiceCard
                    key={voice.id}
                    onPreviewRequested={handleVoicePreview}
                    onUse={setSelectedVoice}
                    selected={selectedVoice?.id === voice.id}
                    useLabel="Select Voice"
                    voice={voice}
                  />
                ))}
              </div>
            </div>
            {selectedVoice ? (
              <p className="text-xs text-muted-foreground">
                Selected: <span className="font-medium text-foreground">{selectedVoice.name}</span>
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-card p-5 shadow-xs">
          <h2 className="font-heading text-base font-semibold tracking-[-0.02em]">Screen size & duration</h2>
          <div className="mt-3 space-y-4">
            <div>
              <Label>Screen size</Label>
              <ToggleGroup
                className="mt-2"
                onValueChange={(value: string[]) => {
                  const next = value[0];
                  if (next === "16:9" || next === "9:16") setAspectRatio(next);
                }}
                spacing={0}
                value={[aspectRatio]}
                variant="outline"
              >
                {RATIO_OPTIONS.map((option) => (
                  <ToggleGroupItem className="flex-1" key={option.value} value={option.value}>
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div>
              <Label>Duration</Label>
              <ToggleGroup
                className="mt-2"
                onValueChange={(value: string[]) => {
                  const next = Number(value[0]);
                  if ((DURATION_OPTIONS as readonly number[]).includes(next)) setDurationSeconds(next as VideoDurationSeconds);
                }}
                spacing={0}
                value={[String(durationSeconds)]}
                variant="outline"
              >
                {DURATION_OPTIONS.map((option) => (
                  <ToggleGroupItem className="flex-1" key={option} value={String(option)}>
                    {option}s
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
        </section>

        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-accent/20 px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">Estimated cost</span>
          <span className={`font-semibold ${insufficientCredits ? "text-destructive" : "text-foreground"}`}>
            {cost} credits · {creditsBalance} available
          </span>
        </div>
        {insufficientCredits ? <p className="text-sm text-destructive">You don&apos;t have enough credits for this generation.</p> : null}

        <Button className="w-full" disabled={!canGenerate || isBusy} onClick={submitGeneration} size="lg">
          {isBusy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
          Generate Avatar Video
        </Button>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-card p-5 shadow-xs">
          <h2 className="font-heading text-base font-semibold tracking-[-0.02em]">Preview</h2>

          <div
            className={`relative mx-auto mt-4 w-full overflow-hidden rounded-xl bg-muted ${
              aspectRatio === "9:16" ? "aspect-[9/16] max-w-[280px]" : "aspect-video"
            }`}
          >
            {status === "completed" && result?.video_url ? (
              <video className="size-full object-cover" controls src={result.video_url} />
            ) : previewImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="Selected avatar" className="size-full object-cover" src={previewImage} />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <UserRoundIcon className="size-8" />
                Select an avatar to preview
              </div>
            )}
          </div>

          <div className="mt-5">
            {status === "generating" ? <ProgressPanel percentage={progress?.percentage ?? 5} step={progress?.step} /> : null}

            {status === "completed" ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-foreground">Your video is ready.</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="flex-1" nativeButton={false} render={<Link href="/dashboard/ai-video-avatar" />} variant="outline">
                    View in Library
                  </Button>
                  {result?.video_url ? (
                    <Button className="flex-1" nativeButton={false} render={<a download href={result.video_url} />} variant="outline">
                      Download
                    </Button>
                  ) : null}
                </div>
                <Button onClick={generateAnother} variant="ghost">
                  <RefreshCwIcon />
                  Generate Another
                </Button>
              </div>
            ) : null}

            {status === "failed" ? (
              <div className="space-y-3">
                <p className="text-sm text-destructive">{errorMessage || "We couldn't generate your video."}</p>
                <Button disabled={isBusy} onClick={submitGeneration} variant="outline">
                  <RefreshCwIcon />
                  Retry
                </Button>
              </div>
            ) : null}

            {status === "idle" ? (
              <p className="text-center text-sm text-muted-foreground">
                Fill in the form and click Generate Avatar Video to start.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
