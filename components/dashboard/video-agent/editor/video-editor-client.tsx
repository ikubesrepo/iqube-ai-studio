"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2Icon, SaveIcon, SparklesIcon } from "lucide-react";

import {
  getVideoAgentProjectStatusAction,
  getVideoAgentSceneAction,
  renderVideoAgentAction,
  updateVideoAgentCaptionStyleAction,
} from "@/app/actions/video-agent";
import { CaptionStylePicker } from "@/components/dashboard/video-agent/caption-style-picker";
import type { EditorScene } from "@/components/dashboard/video-agent/editor/scene-card";
import { SceneEditDialog } from "@/components/dashboard/video-agent/editor/scene-edit-dialog";
import { SceneRunWatcher } from "@/components/dashboard/video-agent/editor/scene-run-watcher";
import { SceneTimeline } from "@/components/dashboard/video-agent/editor/scene-timeline";
import { ProgressPanel, RENDER_STEP_LABELS } from "@/components/dashboard/video-agent/progress-panel";
import { RemotionPlayerClient } from "@/components/dashboard/video-agent/remotion-player-client";
import type { VoiceCardData } from "@/components/dashboard/voice-cloning/voice-card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { BRollStyle } from "@/lib/dashboard/video-agent/pricing";
import type { CaptionStyleId, VideoAgentCompositionProps } from "@/remotion/types";

type ActiveRun = { runId: string; publicToken: string };

export function VideoEditorClient({
  projectId,
  title,
  bRollStyle,
  compositionData: initialCompositionData,
  scenes: initialScenes,
  customVoices,
  defaultVoices,
  initialStatus,
}: {
  projectId: string;
  title: string;
  bRollStyle: BRollStyle;
  compositionData: VideoAgentCompositionProps;
  scenes: EditorScene[];
  customVoices: VoiceCardData[];
  defaultVoices: VoiceCardData[];
  initialStatus: string;
}) {
  const [compositionData, setCompositionData] = useState(initialCompositionData);
  const [scenes, setScenes] = useState(initialScenes);
  const [persistedCaptionStyle, setPersistedCaptionStyle] = useState<CaptionStyleId>(initialCompositionData.captionStyle);
  const [selectedScene, setSelectedScene] = useState<EditorScene | null>(null);
  const [activeSceneRuns, setActiveSceneRuns] = useState<Record<string, ActiveRun>>({});
  const [exportRun, setExportRun] = useState<ActiveRun | null>(null);
  const [exportProgress, setExportProgress] = useState<{ step: string; percentage: number } | undefined>(undefined);
  const [exportStatus, setExportStatus] = useState<"idle" | "rendering" | "completed">(
    initialStatus === "completed" ? "completed" : "idle",
  );
  const [isSaving, startSave] = useTransition();
  const [isExporting, startExport] = useTransition();

  const captionStyleDirty = compositionData.captionStyle !== persistedCaptionStyle;
  const generatingSceneIds = useMemo(() => new Set(Object.keys(activeSceneRuns)), [activeSceneRuns]);

  function handleCaptionStyleChange(style: CaptionStyleId) {
    setCompositionData((prev) => ({ ...prev, captionStyle: style }));
  }

  function handleSceneStarted(sceneId: string, runId: string, publicToken: string) {
    setActiveSceneRuns((prev) => ({ ...prev, [sceneId]: { runId, publicToken } }));
  }

  async function refreshSceneAndComposition(sceneId: string) {
    const [scene, project] = await Promise.all([
      getVideoAgentSceneAction(projectId, sceneId),
      getVideoAgentProjectStatusAction(projectId),
    ]);

    if (scene) {
      setScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, ...scene } : s)));
    }

    if (project?.composition_data) {
      setCompositionData(project.composition_data as VideoAgentCompositionProps);
    }
  }

  function handleSceneCompleted(sceneId: string) {
    setActiveSceneRuns((prev) => {
      const next = { ...prev };
      delete next[sceneId];
      return next;
    });

    refreshSceneAndComposition(sceneId)
      .then(() => {
        toast.add({ type: "success", title: "Scene updated", description: "The new asset is now in the preview." });
      })
      .catch(() => {
        toast.add({ type: "error", title: "Couldn't refresh scene", description: "Reload the page to see the latest state." });
      });
  }

  function handleSceneFailed(sceneId: string, message: string) {
    setActiveSceneRuns((prev) => {
      const next = { ...prev };
      delete next[sceneId];
      return next;
    });

    refreshSceneAndComposition(sceneId).finally(() => {
      toast.add({ type: "error", title: "Scene generation failed", description: message });
    });
  }

  function handleSaveChanges() {
    startSave(async () => {
      try {
        if (captionStyleDirty) {
          const result = await updateVideoAgentCaptionStyleAction(projectId, compositionData.captionStyle);
          setPersistedCaptionStyle(compositionData.captionStyle);
          setCompositionData(result.compositionData);
        }
        toast.add({ type: "success", title: "Changes saved", description: "Your edits are saved." });
      } catch (err) {
        toast.add({ type: "error", title: "Couldn't save changes", description: err instanceof Error ? err.message : "Please try again." });
      }
    });
  }

  function handleExport() {
    startExport(async () => {
      try {
        const { runId, publicToken } = await renderVideoAgentAction(projectId);
        setExportRun({ runId, publicToken });
        setExportProgress(undefined);
        setExportStatus("rendering");
      } catch (err) {
        toast.add({ type: "error", title: "Couldn't start export", description: err instanceof Error ? err.message : "Please try again." });
      }
    });
  }

  function handleExportCompleted() {
    setExportRun(null);
    setExportStatus("completed");
    toast.add({ type: "success", title: "Export complete", description: "Your updated video finished rendering." });
  }

  function handleExportFailed(message: string) {
    setExportRun(null);
    setExportStatus("idle");
    toast.add({ type: "error", title: "Export failed", description: message });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-6">
        <div className="overflow-hidden rounded-xl border border-border/60 bg-black shadow-sm">
          <RemotionPlayerClient compositionData={compositionData} />
        </div>

        <SceneTimeline
          generatingSceneIds={generatingSceneIds}
          onEditScene={setSelectedScene}
          scenes={scenes}
        />

        <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            {exportRun ? (
              <ProgressPanel percentage={exportProgress?.percentage ?? 5} step={exportProgress?.step} steps={RENDER_STEP_LABELS} />
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button disabled={isSaving || !captionStyleDirty} onClick={handleSaveChanges} variant="outline">
              {isSaving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
              Save Changes
            </Button>
            <Button disabled={isExporting || Boolean(exportRun)} onClick={handleExport}>
              {isExporting || exportRun ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              Export Updated Video
            </Button>
          </div>
        </div>
      </div>

      <aside className="space-y-4 rounded-xl border border-border/60 bg-card p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{exportStatus === "completed" ? "Up to date" : "Has unrendered changes"}</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Caption style</p>
          <CaptionStylePicker onChange={handleCaptionStyleChange} value={compositionData.captionStyle} />
        </div>
      </aside>

      {selectedScene ? (
        <SceneEditDialog
          customVoices={customVoices}
          defaultBRollStyle={bRollStyle}
          defaultVoices={defaultVoices}
          onOpenChange={(open) => !open && setSelectedScene(null)}
          onStarted={(sceneId, runId, publicToken) => {
            handleSceneStarted(sceneId, runId, publicToken);
            setSelectedScene(null);
          }}
          open={Boolean(selectedScene)}
          projectId={projectId}
          scene={selectedScene}
        />
      ) : null}

      {Object.entries(activeSceneRuns).map(([sceneId, run]) => (
        <SceneRunWatcher
          key={sceneId}
          onCompleted={() => handleSceneCompleted(sceneId)}
          onFailed={(message) => handleSceneFailed(sceneId, message)}
          publicToken={run.publicToken}
          runId={run.runId}
        />
      ))}

      {exportRun ? (
        <SceneRunWatcher
          onCompleted={handleExportCompleted}
          onFailed={handleExportFailed}
          onProgress={setExportProgress}
          publicToken={exportRun.publicToken}
          runId={exportRun.runId}
        />
      ) : null}
    </div>
  );
}
