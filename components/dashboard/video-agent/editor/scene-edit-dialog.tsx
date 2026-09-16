"use client";

import { useState, useTransition } from "react";
import { ImageIcon, Loader2Icon, SearchIcon, SparklesIcon, UserRoundIcon, VideoIcon, WandSparklesIcon } from "lucide-react";

import { regenerateSceneAvatarAction, regenerateSceneBRollAction, searchVideoAgentStockMediaAction } from "@/app/actions/video-agent";
import type { EditorScene } from "@/components/dashboard/video-agent/editor/scene-card";
import { VoiceCard, type VoiceCardData } from "@/components/dashboard/voice-cloning/voice-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/components/ui/toast";
import type { BRollStyle } from "@/lib/dashboard/video-agent/pricing";
import type { StockImageCandidate, StockVideoCandidate } from "@/lib/dashboard/video-agent/pixabay";

type Tab = "ai_image" | "ai_video" | "stock" | "ai_illustration" | "avatar";

const TAB_INFO: Record<Tab, { label: string; icon: typeof ImageIcon }> = {
  ai_image: { label: "AI Image", icon: ImageIcon },
  ai_video: { label: "AI Video", icon: VideoIcon },
  stock: { label: "Stock Media", icon: SearchIcon },
  ai_illustration: { label: "Illustration", icon: WandSparklesIcon },
  avatar: { label: "Avatar Video", icon: UserRoundIcon },
};

const B_ROLL_TAB_FOR_STYLE: Record<BRollStyle, Tab> = {
  ai_image: "ai_image",
  ai_video: "ai_video",
  stock: "stock",
  ai_illustration: "ai_illustration",
};

export function SceneEditDialog({
  open,
  onOpenChange,
  projectId,
  scene,
  defaultBRollStyle,
  customVoices,
  defaultVoices,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  scene: EditorScene;
  defaultBRollStyle: BRollStyle;
  customVoices: VoiceCardData[];
  defaultVoices: VoiceCardData[];
  onStarted: (sceneId: string, runId: string, publicToken: string) => void;
}) {
  const [tab, setTab] = useState<Tab>(B_ROLL_TAB_FOR_STYLE[defaultBRollStyle]);
  const [prompt, setPrompt] = useState(scene.visual_prompt ?? "");
  const [stockQuery, setStockQuery] = useState(scene.visual_prompt ?? "");
  const [stockMediaType, setStockMediaType] = useState<"image" | "video">("image");
  const [stockResults, setStockResults] = useState<(StockImageCandidate | StockVideoCandidate)[]>([]);
  const [selectedStockUrl, setSelectedStockUrl] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<VoiceCardData | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [isSubmitting, startSubmit] = useTransition();

  function handleSearchStock() {
    if (!stockQuery.trim()) return;

    startSearch(async () => {
      try {
        const results = await searchVideoAgentStockMediaAction(stockQuery, stockMediaType);
        setStockResults(results);
        setSelectedStockUrl(null);
      } catch (err) {
        toast.add({ type: "error", title: "Search failed", description: err instanceof Error ? err.message : "Please try again." });
      }
    });
  }

  function handleSubmit() {
    startSubmit(async () => {
      try {
        if (tab === "avatar") {
          if (!selectedVoice) {
            toast.add({ type: "error", title: "Choose a voice", description: "Pick a voice to narrate this scene's avatar clip." });
            return;
          }

          const { runId, publicToken } = await regenerateSceneAvatarAction(projectId, scene.id, {
            voiceCloneId: selectedVoice.type === "Custom" ? selectedVoice.id : undefined,
            defaultVoiceId: selectedVoice.type === "Default" ? selectedVoice.id : undefined,
            prompt,
            fallbackBRollStyle: defaultBRollStyle,
          });

          onStarted(scene.id, runId, publicToken);
        } else if (tab === "stock") {
          if (!selectedStockUrl) {
            toast.add({ type: "error", title: "Pick a result", description: "Search and select a stock image or video first." });
            return;
          }

          const { runId, publicToken } = await regenerateSceneBRollAction(projectId, scene.id, {
            bRollStyle: "stock",
            visualPrompt: stockQuery,
            stockPick: { type: stockMediaType === "video" ? "stock_video" : "stock_image", url: selectedStockUrl },
          });

          onStarted(scene.id, runId, publicToken);
        } else {
          if (!prompt.trim()) {
            toast.add({ type: "error", title: "Enter a prompt", description: "Describe what this scene should show." });
            return;
          }

          const { runId, publicToken } = await regenerateSceneBRollAction(projectId, scene.id, {
            bRollStyle: tab,
            visualPrompt: prompt,
          });

          onStarted(scene.id, runId, publicToken);
        }

        onOpenChange(false);
        toast.add({ type: "success", title: "Generating scene asset", description: "This scene will update automatically when it's ready." });
      } catch (err) {
        toast.add({ type: "error", title: "Couldn't start generation", description: err instanceof Error ? err.message : "Please try again." });
      }
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Scene {scene.scene_index + 1}</DialogTitle>
        </DialogHeader>

        <Tabs onValueChange={(value) => setTab(value as Tab)} value={tab}>
          <TabsList className="grid w-full grid-cols-5">
            {(Object.keys(TAB_INFO) as Tab[]).map((key) => {
              const Icon = TAB_INFO[key].icon;
              return (
                <TabsTrigger key={key} value={key}>
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{TAB_INFO[key].label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent className="mt-4 space-y-3" value="ai_image">
            <Label>Describe the image</Label>
            <Textarea onChange={(e) => setPrompt(e.target.value)} placeholder="A close-up of..." value={prompt} />
          </TabsContent>

          <TabsContent className="mt-4 space-y-3" value="ai_video">
            <Label>Describe the video clip</Label>
            <Textarea onChange={(e) => setPrompt(e.target.value)} placeholder="A slow pan across..." value={prompt} />
          </TabsContent>

          <TabsContent className="mt-4 space-y-3" value="ai_illustration">
            <Label>Describe the animated illustration</Label>
            <Textarea onChange={(e) => setPrompt(e.target.value)} placeholder="An icon of a graph rising..." value={prompt} />
          </TabsContent>

          <TabsContent className="mt-4 space-y-3" value="stock">
            <Label>Search stock media</Label>
            <div className="flex gap-2">
              <Textarea
                className="min-h-9 flex-1"
                onChange={(e) => setStockQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearchStock();
                  }
                }}
                placeholder="mountains, sunrise, coffee shop..."
                value={stockQuery}
              />
              <ToggleGroup
                onValueChange={(value: string[]) => value[0] && setStockMediaType(value[0] as "image" | "video")}
                spacing={0}
                value={[stockMediaType]}
                variant="outline"
              >
                <ToggleGroupItem value="image">Image</ToggleGroupItem>
                <ToggleGroupItem value="video">Video</ToggleGroupItem>
              </ToggleGroup>
              <Button disabled={isSearching || !stockQuery.trim()} onClick={handleSearchStock}>
                {isSearching ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}
                Search
              </Button>
            </div>

            {stockResults.length > 0 ? (
              <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto pr-1">
                {stockResults.map((result) => (
                  <button
                    className={`relative aspect-video overflow-hidden rounded-md border-2 ${
                      selectedStockUrl === result.fullUrl ? "border-primary ring-2 ring-primary/30" : "border-border/60 hover:border-primary/50"
                    }`}
                    key={result.id}
                    onClick={() => setSelectedStockUrl(result.fullUrl)}
                    type="button"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="Stock result" className="size-full object-cover" src={result.previewUrl} />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Search Pixabay for a photo or clip, then pick one.</p>
            )}
          </TabsContent>

          <TabsContent className="mt-4 space-y-3" value="avatar">
            <Label>Choose a voice for this scene</Label>
            <p className="text-xs text-muted-foreground">
              This voice will narrate &quot;{scene.voiceover_segment.slice(0, 120)}
              {scene.voiceover_segment.length > 120 ? "…" : ""}&quot; -- capped at 5 seconds of avatar video, matching the scene&apos;s
              window.
            </p>
            <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto pr-1">
              {[...defaultVoices, ...customVoices].map((voice) => (
                <VoiceCard key={voice.id} onUse={setSelectedVoice} selected={selectedVoice?.id === voice.id} voice={voice} useLabel="Select" />
              ))}
            </div>
            <Label>Optional direction for the avatar (expression/tone hint)</Label>
            <Textarea onChange={(e) => setPrompt(e.target.value)} placeholder="Smiling, energetic delivery..." value={prompt} />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button disabled={isSubmitting} onClick={handleSubmit}>
            {isSubmitting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
