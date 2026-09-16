import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { warmDefaultVoicePreviews } from "@/app/actions/voice-cloning";
import { VideoEditorClient } from "@/components/dashboard/video-agent/editor/video-editor-client";
import type { VoiceCardData } from "@/components/dashboard/voice-cloning/voice-card";
import { Button } from "@/components/ui/button";
import { DEFAULT_VOICES } from "@/lib/dashboard/voice-cloning/default-voices";
import { requireUser } from "@/lib/auth/utils";
import { createInsforgeServerClient } from "@/lib/insforge/server";
import type { VideoAgentCompositionProps } from "@/remotion/types";

export default async function EditAiVideoAgentPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const { data: project, error: projectError } = await client.database
    .from("video_agent_projects")
    .select(
      "id, title, aspect_ratio, caption_style, b_roll_style, status, composition_data, avatar_id, avatar_label, voice_label",
    )
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (projectError || !project || (project.status !== "awaiting_render" && project.status !== "completed") || !project.composition_data) {
    notFound();
  }

  const { data: sceneRows } = await client.database
    .from("video_agent_scenes")
    .select(
      "id, scene_index, title, start_time, end_time, has_avatar_clip, avatar_clip_url, avatar_clip_duration_seconds, b_roll_type, b_roll_url, illustration_data, visual_prompt, voiceover_segment, caption_text, status",
    )
    .eq("project_id", projectId)
    .order("scene_index", { ascending: true });

  const [{ data: voiceClones }, previewMap] = await Promise.all([
    client.database
      .from("voice_clones")
      .select("id, name, status, cloned_audio_url")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false }),
    warmDefaultVoicePreviews(),
  ]);

  const customVoices: VoiceCardData[] = (voiceClones ?? []).map((voice) => ({
    id: voice.id,
    name: voice.name,
    type: "Custom",
    status: voice.status,
    previewAudioUrl: voice.cloned_audio_url,
    description: "Cloned with Replicate Chatterbox from your uploaded sample.",
  }));

  const defaultVoices: VoiceCardData[] = DEFAULT_VOICES.map((voice) => ({
    id: voice.id,
    name: voice.name,
    type: "Default",
    previewAudioUrl: previewMap[voice.id] ?? null,
    description: `${voice.description} ${voice.accent ?? ""} English.`.trim(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <Button nativeButton={false} render={<Link href="/dashboard/ai-video-agent" />} size="sm" variant="ghost">
          <ArrowLeftIcon />
          Back to AI Video Agent
        </Button>
      </div>

      <header>
        <p className="text-sm font-semibold tracking-[0.18em] text-primary/75">AI VIDEO AGENT</p>
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.04em] text-foreground">Edit &quot;{project.title}&quot;</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Replace individual scene assets, change the caption style, then export an updated video.
        </p>
      </header>

      <VideoEditorClient
        bRollStyle={project.b_roll_style}
        compositionData={project.composition_data as VideoAgentCompositionProps}
        customVoices={customVoices}
        defaultVoices={defaultVoices}
        initialStatus={project.status}
        projectId={project.id}
        scenes={sceneRows ?? []}
        title={project.title}
      />
    </div>
  );
}
