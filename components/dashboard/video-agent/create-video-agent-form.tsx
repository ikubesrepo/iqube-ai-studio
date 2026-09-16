"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { Loader2Icon, RefreshCwIcon, SparklesIcon, UserRoundIcon } from "lucide-react";

import {
  generateProjectScriptAction,
  generateVideoAgentAction,
  getVideoAgentProjectStatusAction,
  renderVideoAgentAction,
} from "@/app/actions/video-agent";
import { getOrCreateDefaultVoicePreviewAction } from "@/app/actions/voice-cloning";
import { AvatarPicker, type PickableAvatar } from "@/components/dashboard/video-avatars/avatar-picker";
import { BRollStylePicker } from "@/components/dashboard/video-agent/b-roll-style-picker";
import { CaptionStylePicker } from "@/components/dashboard/video-agent/caption-style-picker";
import { ProgressPanel, RENDER_STEP_LABELS } from "@/components/dashboard/video-agent/progress-panel";
import { RemotionPlayerClient } from "@/components/dashboard/video-agent/remotion-player-client";
import { VoiceCard, type VoiceCardData } from "@/components/dashboard/voice-cloning/voice-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DURATION_OPTIONS,
  estimateVideoAgentCreditsCost,
  estimateSceneCount,
  type BRollStyle,
  type VideoAgentDurationSeconds,
} from "@/lib/dashboard/video-agent/pricing";
import type { CaptionStyleId, TransitionStyleId, VideoAgentCompositionProps } from "@/remotion/types";

const RATIO_OPTIONS = [
  { value: "16:9", label: "16:9 Landscape" },
  { value: "9:16", label: "9:16 Vertical" },
] as const;

const TRANSITION_STYLE_OPTIONS: Array<{ value: TransitionStyleId; label: string }> = [
  { value: "crossfade", label: "Crossfade" },
  { value: "hard_cut", label: "Hard cut" },
  { value: "none", label: "No transition" },
];

const SCRIPT_MAX_LENGTH = 20000;
const TERMINAL_FAILURE_STATUSES = new Set(["FAILED", "CRASHED", "SYSTEM_FAILURE", "TIMED_OUT", "EXPIRED", "CANCELED"]);

type Stage = "idle" | "preparing" | "reviewing" | "rendering" | "completed" | "failed";
type FailedStage = "preparing" | "rendering" | null;
type ResultData = { videoUrl: string | null; compositionData: VideoAgentCompositionProps | null };
type SceneProgress = { completed: number; total: number };

export function CreateVideoAgentForm({
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
  const [title, setTitle] = useState("");
  const [scriptMode, setScriptMode] = useState<"manual" | "ai_topic">("manual");
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState("");
  const [isGeneratingScript, startScriptGeneration] = useTransition();

  const [selectedAvatar, setSelectedAvatar] = useState<PickableAvatar | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<VoiceCardData | null>(null);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");
  const [durationSeconds, setDurationSeconds] = useState<VideoAgentDurationSeconds>(30);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyleId>("bold_subtitle");
  const [bRollStyle, setBRollStyle] = useState<BRollStyle>("stock");
  const [refinementNotes, setRefinementNotes] = useState("");
  const [transitionStyle, setTransitionStyle] = useState<TransitionStyleId>("crossfade");

  const [stage, setStage] = useState<Stage>("idle");
  const [failedStage, setFailedStage] = useState<FailedStage>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [prepareRunId, setPrepareRunId] = useState<string | null>(null);
  const [preparePublicToken, setPreparePublicToken] = useState<string | null>(null);
  const [renderRunId, setRenderRunId] = useState<string | null>(null);
  const [renderPublicToken, setRenderPublicToken] = useState<string | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [sceneProgress, setSceneProgress] = useState<SceneProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();

  const { run: prepareRun } = useRealtimeRun(prepareRunId ?? undefined, {
    accessToken: preparePublicToken ?? undefined,
    enabled: Boolean(prepareRunId && preparePublicToken) && stage === "preparing",
  });

  const { run: renderRun } = useRealtimeRun(renderRunId ?? undefined, {
    accessToken: renderPublicToken ?? undefined,
    enabled: Boolean(renderRunId && renderPublicToken) && stage === "rendering",
  });

  useEffect(() => {
    if (!prepareRun || !projectId || stage !== "preparing") return;

    if (prepareRun.status === "COMPLETED") {
      getVideoAgentProjectStatusAction(projectId)
        .then((data) => {
          if (!data || data.status !== "awaiting_render" || !data.composition_data) {
            throw new Error(data?.error_message || "Unexpected project state.");
          }
          setResult({ videoUrl: null, compositionData: data.composition_data as VideoAgentCompositionProps });
          setStage("reviewing");
          toast.add({ type: "success", title: "Preview ready", description: "Review it, then render the final video when you're happy." });
        })
        .catch((err) => {
          setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
          setFailedStage("preparing");
          setStage("failed");
        });
    } else if (TERMINAL_FAILURE_STATUSES.has(prepareRun.status)) {
      getVideoAgentProjectStatusAction(projectId)
        .then((data) => {
          setErrorMessage(data?.error_message || "Generation failed. Please try again.");
        })
        .catch(() => {
          setErrorMessage("Generation failed. Please try again.");
        })
        .finally(() => {
          setFailedStage("preparing");
          setStage("failed");
        });
    }
  }, [prepareRun, projectId, stage]);

  useEffect(() => {
    if (!renderRun || !projectId || stage !== "rendering") return;

    if (renderRun.status === "COMPLETED") {
      getVideoAgentProjectStatusAction(projectId)
        .then((data) => {
          if (!data || data.status !== "completed" || !data.video_url) {
            throw new Error(data?.error_message || "Unexpected project state.");
          }
          setResult((prev) => ({ videoUrl: data.video_url, compositionData: prev?.compositionData ?? null }));
          setStage("completed");
          toast.add({ type: "success", title: "Video ready", description: "Your AI Video Agent video finished rendering." });
        })
        .catch((err) => {
          setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
          setFailedStage("rendering");
          setStage("failed");
        });
    } else if (TERMINAL_FAILURE_STATUSES.has(renderRun.status)) {
      getVideoAgentProjectStatusAction(projectId)
        .then((data) => {
          setErrorMessage(data?.error_message || "Render failed. Please try again.");
        })
        .catch(() => {
          setErrorMessage("Render failed. Please try again.");
        })
        .finally(() => {
          // result.compositionData is intentionally left as-is -- the
          // preview stays visible above the error so a render failure
          // doesn't hide the already-generated scenes/avatar/B-roll.
          setFailedStage("rendering");
          setStage("failed");
        });
    }
  }, [renderRun, projectId, stage]);

  // Safety net: the realtime channel can silently miss its final event on
  // long-running tasks (observed: the UI stayed stuck on an in-progress
  // step even though the backend had already finished). Poll the actual DB
  // status independently so completion/failure is still detected even if
  // realtime never delivers it. Whichever path (realtime or poll) resolves
  // first flips `stage`, which tears down the other effect via its
  // `cancelled` cleanup before its own in-flight check can double-fire.
  useEffect(() => {
    if (!projectId || stage !== "preparing") return;

    let cancelled = false;
    const interval = setInterval(() => {
      getVideoAgentProjectStatusAction(projectId)
        .then((data) => {
          if (cancelled || !data) return;

          if (data.status === "awaiting_render" && data.composition_data) {
            setResult({ videoUrl: null, compositionData: data.composition_data as VideoAgentCompositionProps });
            setSceneProgress(null);
            setStage("reviewing");
            toast.add({ type: "success", title: "Preview ready", description: "Review it, then render the final video when you're happy." });
            return;
          }

          if (data.status === "failed") {
            setErrorMessage(data.error_message || "Generation failed. Please try again.");
            setFailedStage("preparing");
            setStage("failed");
            return;
          }

          // Still in progress -- surface whatever partial preview/count
          // exists so far (see generate-video-agent-scene.ts's best-effort
          // incremental composition_data + scenes_completed updates), so
          // the preview grows and the percentage stays real instead of
          // sitting pinned at one pipeline-step value for minutes.
          if (data.composition_data) {
            setResult({ videoUrl: null, compositionData: data.composition_data as VideoAgentCompositionProps });
          }
          if (typeof data.scenes_total === "number" && data.scenes_total > 0) {
            setSceneProgress({ completed: data.scenes_completed ?? 0, total: data.scenes_total });
          }
        })
        .catch(() => {});
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [projectId, stage]);

  useEffect(() => {
    if (!projectId || stage !== "rendering") return;

    let cancelled = false;
    const interval = setInterval(() => {
      getVideoAgentProjectStatusAction(projectId)
        .then((data) => {
          if (cancelled || !data) return;
          if (data.status === "completed" && data.video_url) {
            setResult((prev) => ({ videoUrl: data.video_url, compositionData: prev?.compositionData ?? null }));
            setStage("completed");
            toast.add({ type: "success", title: "Video ready", description: "Your AI Video Agent video finished rendering." });
          } else if (data.status === "failed") {
            setErrorMessage(data.error_message || "Render failed. Please try again.");
            setFailedStage("rendering");
            setStage("failed");
          }
        })
        .catch(() => {});
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [projectId, stage]);

  const prepareProgress = prepareRun?.metadata?.progress as { step: string; percentage: number } | undefined;
  const renderProgress = renderRun?.metadata?.progress as { step: string; percentage: number } | undefined;
  const sceneCountEstimate = estimateSceneCount(durationSeconds);
  const cost = estimateVideoAgentCreditsCost(durationSeconds, bRollStyle);
  const insufficientCredits = cost > creditsBalance;
  const trimmedScript = script.trim();

  const canGenerate =
    Boolean(title.trim()) &&
    Boolean(trimmedScript) &&
    trimmedScript.length <= SCRIPT_MAX_LENGTH &&
    Boolean(selectedAvatar) &&
    Boolean(selectedVoice) &&
    !insufficientCredits;

  const previewImage = useMemo(() => {
    if (!selectedAvatar) return null;
    return aspectRatio === "16:9" ? selectedAvatar.crop_16_9_url : selectedAvatar.crop_9_16_url;
  }, [selectedAvatar, aspectRatio]);

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
        formData.set("durationSeconds", String(durationSeconds));
        const { script: generated } = await generateProjectScriptAction(formData);
        setScript(generated);
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
      formData.set("title", title.trim());
      formData.set("scriptSource", scriptMode);
      if (topic.trim()) formData.set("topic", topic.trim());
      formData.set("script", trimmedScript);
      formData.set("avatarId", selectedAvatar.id);
      formData.set("aspectRatio", aspectRatio);
      formData.set("durationSeconds", String(durationSeconds));
      formData.set("captionStyle", captionStyle);
      formData.set("bRollStyle", bRollStyle);
      formData.set("transitionStyle", transitionStyle);
      if (refinementNotes.trim()) formData.set("refinementNotes", refinementNotes.trim());
      if (selectedVoice.type === "Default") {
        formData.set("defaultVoiceId", selectedVoice.id);
      } else {
        formData.set("voiceCloneId", selectedVoice.id);
      }

      try {
        const { projectId: newId, runId: newRunId, publicToken: newToken } = await generateVideoAgentAction(formData);
        setResult(null);
        setSceneProgress(null);
        setErrorMessage(null);
        setFailedStage(null);
        setProjectId(newId);
        setPrepareRunId(newRunId);
        setPreparePublicToken(newToken);
        setRenderRunId(null);
        setRenderPublicToken(null);
        setRefinementNotes("");
        setStage("preparing");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to start generation";
        setErrorMessage(message);
        toast.add({ type: "error", title: "Couldn't start generation", description: message });
      }
    });
  }

  function handleConfirmRender() {
    if (!projectId) return;

    startSubmit(async () => {
      setErrorMessage(null);
      try {
        const { runId: newRunId, publicToken: newToken } = await renderVideoAgentAction(projectId);
        setRenderRunId(newRunId);
        setRenderPublicToken(newToken);
        setStage("rendering");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to start render";
        toast.add({ type: "error", title: "Couldn't start render", description: message });
      }
    });
  }

  function handleRetry() {
    if (failedStage === "rendering") {
      handleConfirmRender();
    } else {
      submitGeneration();
    }
  }

  function generateAnother() {
    setStage("idle");
    setFailedStage(null);
    setProjectId(null);
    setPrepareRunId(null);
    setPreparePublicToken(null);
    setRenderRunId(null);
    setRenderPublicToken(null);
    setResult(null);
    setSceneProgress(null);
    setErrorMessage(null);
  }

  const isBusy = isSubmitting || stage === "preparing" || stage === "rendering";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <section className="rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-card p-5 shadow-xs">
          <Label htmlFor="video-name">Video name</Label>
          <Input className="mt-2" id="video-name" onChange={(event) => setTitle(event.target.value)} placeholder="e.g. New Pricing Announcement" value={title} />
        </section>

        <section className="rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-card p-5 shadow-xs">
          <h2 className="font-heading text-base font-semibold tracking-[-0.02em]">Script or topic</h2>
          <Tabs className="mt-3" onValueChange={(value) => setScriptMode(value as "manual" | "ai_topic")} value={scriptMode}>
            <TabsList>
              <TabsTrigger value="manual">Write manually</TabsTrigger>
              <TabsTrigger value="ai_topic">Generate with AI</TabsTrigger>
            </TabsList>

            <TabsContent value="ai_topic">
              <div className="mt-3 space-y-3">
                <div>
                  <Label htmlFor="agent-topic">Topic</Label>
                  <Input className="mt-2" id="agent-topic" onChange={(event) => setTopic(event.target.value)} placeholder="e.g. 5 tips for better sleep" value={topic} />
                </div>
                <Button disabled={!topic.trim() || isGeneratingScript} onClick={handleGenerateScript} variant="outline">
                  {isGeneratingScript ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                  Generate Script for {durationSeconds}s Video
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="agent-script">Script</Label>
              <span className={`text-xs ${script.length > SCRIPT_MAX_LENGTH ? "text-destructive" : "text-muted-foreground"}`}>
                {script.length}/{SCRIPT_MAX_LENGTH}
              </span>
            </div>
            <Textarea
              className="mt-2 min-h-40"
              id="agent-script"
              maxLength={SCRIPT_MAX_LENGTH}
              onChange={(event) => setScript(event.target.value)}
              placeholder="Write the full script your video should narrate, or generate one with AI above…"
              value={script}
            />
          </div>
        </section>

        <section className="rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-card p-5 shadow-xs">
          <h2 className="font-heading text-base font-semibold tracking-[-0.02em]">Video length &amp; screen size</h2>
          <div className="mt-3 space-y-4">
            <div>
              <Label>Video length</Label>
              <ToggleGroup
                className="mt-2"
                onValueChange={(value: string[]) => {
                  const next = Number(value[0]);
                  if ((DURATION_OPTIONS as readonly number[]).includes(next)) setDurationSeconds(next as VideoAgentDurationSeconds);
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
          </div>
        </section>

        <section className="rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-card p-5 shadow-xs">
          <h2 className="font-heading text-base font-semibold tracking-[-0.02em]">Video avatar</h2>
          <div className="mt-3">
            <AvatarPicker
              aspectRatio={aspectRatio}
              avatars={avatars}
              onSelect={setSelectedAvatar}
              selectedId={selectedAvatar?.id ?? null}
            />
          </div>
        </section>

        <section className="rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-card p-5 shadow-xs">
          <h2 className="font-heading text-base font-semibold tracking-[-0.02em]">Caption design</h2>
          <div className="mt-3">
            <CaptionStylePicker onChange={setCaptionStyle} value={captionStyle} />
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
          </div>
        </section>

        <section className="rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-card p-5 shadow-xs">
          <h2 className="font-heading text-base font-semibold tracking-[-0.02em]">B-roll style</h2>
          <div className="mt-3">
            <BRollStylePicker onChange={setBRollStyle} value={bRollStyle} />
          </div>
        </section>

        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-accent/20 px-3 py-2.5 text-sm">
          <span className="text-muted-foreground">Estimated cost (~{sceneCountEstimate} scenes)</span>
          <span className={`font-semibold ${insufficientCredits ? "text-destructive" : "text-foreground"}`}>
            {cost} credits · {creditsBalance} available
          </span>
        </div>
        {insufficientCredits ? <p className="text-sm text-destructive">You don&apos;t have enough credits for this generation.</p> : null}

        <Button className="w-full" disabled={!canGenerate || isBusy} onClick={submitGeneration} size="lg">
          {isBusy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
          Generate Video
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
            {result?.compositionData ? (
              <RemotionPlayerClient compositionData={result.compositionData} />
            ) : stage === "completed" && result?.videoUrl ? (
              <video className="size-full object-cover" controls src={result.videoUrl} />
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
            {stage === "preparing" ? (
              <div className="space-y-3">
                {sceneProgress ? (
                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-accent/20 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Scenes generated</span>
                    <span className="font-semibold text-foreground">
                      {sceneProgress.completed} of {sceneProgress.total} ({Math.round((sceneProgress.completed / sceneProgress.total) * 100)}%)
                    </span>
                  </div>
                ) : null}
                <ProgressPanel percentage={prepareProgress?.percentage ?? 5} step={prepareProgress?.step} />
              </div>
            ) : null}

            {stage === "reviewing" ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Preview ready -- take a look above.</p>
                <p className="text-xs text-muted-foreground">
                  Not happy with a scene, the avatar, or the B-roll? Regenerate instead of rendering. Rendering the final MP4 uses
                  additional compute, so only render once the preview looks right.
                </p>
                <div>
                  <Label htmlFor="refinement-notes">Refinement notes (optional)</Label>
                  <Textarea
                    className="mt-2"
                    id="refinement-notes"
                    onChange={(e) => setRefinementNotes(e.target.value)}
                    placeholder="Tell it what to change before regenerating, e.g. 'shorten the intro' or 'focus more on pricing'."
                    rows={2}
                    value={refinementNotes}
                  />
                </div>
                <div>
                  <Label>Transitions</Label>
                  <ToggleGroup
                    className="mt-2"
                    onValueChange={(value: string[]) => {
                      const next = value[0];
                      if (next) setTransitionStyle(next as TransitionStyleId);
                    }}
                    spacing={0}
                    value={[transitionStyle]}
                    variant="outline"
                  >
                    {TRANSITION_STYLE_OPTIONS.map((option) => (
                      <ToggleGroupItem className="flex-1" key={option.value} value={option.value}>
                        {option.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
                <Button className="w-full" disabled={isBusy} onClick={handleConfirmRender} size="lg">
                  {isBusy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                  Render Final Video
                </Button>
                <Button disabled={isBusy} onClick={submitGeneration} variant="ghost">
                  <RefreshCwIcon />
                  Regenerate
                </Button>
              </div>
            ) : null}

            {stage === "rendering" ? <ProgressPanel percentage={renderProgress?.percentage ?? 5} step={renderProgress?.step} steps={RENDER_STEP_LABELS} /> : null}

            {stage === "completed" ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-foreground">Your video is ready.</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="flex-1" nativeButton={false} render={<Link href="/dashboard/ai-video-agent" />} variant="outline">
                    View in Library
                  </Button>
                  {result?.videoUrl ? (
                    <Button className="flex-1" nativeButton={false} render={<a download href={result.videoUrl} />} variant="outline">
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

            {stage === "failed" ? (
              <div className="space-y-3">
                <p className="text-sm text-destructive">{errorMessage || "We couldn't generate your video."}</p>
                {result?.compositionData ? (
                  <p className="text-xs text-muted-foreground">
                    {failedStage === "rendering"
                      ? "The scenes, avatar clips, and narration above already finished generating and are shown in the preview -- only the final video render failed. Your credits for this attempt were refunded."
                      : "The preview above is from a previous attempt."}
                  </p>
                ) : null}
                <Button disabled={isBusy} onClick={handleRetry} variant="outline">
                  <RefreshCwIcon />
                  {failedStage === "rendering" ? "Retry Render" : "Retry"}
                </Button>
              </div>
            ) : null}

            {stage === "idle" ? (
              <p className="text-center text-sm text-muted-foreground">Fill in the form and click Generate Video to start.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
