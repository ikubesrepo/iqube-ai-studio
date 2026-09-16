"use client";

import { EditorScene, SceneCard } from "@/components/dashboard/video-agent/editor/scene-card";

export function SceneTimeline({
  scenes,
  generatingSceneIds,
  onEditScene,
}: {
  scenes: EditorScene[];
  generatingSceneIds: Set<string>;
  onEditScene: (scene: EditorScene) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">Scenes</p>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {scenes.map((scene) => (
          <SceneCard
            isGenerating={generatingSceneIds.has(scene.id)}
            key={scene.id}
            onEdit={() => onEditScene(scene)}
            scene={scene}
          />
        ))}
      </div>
    </div>
  );
}
