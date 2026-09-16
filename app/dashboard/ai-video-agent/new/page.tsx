import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

import { warmDefaultVoicePreviews } from "@/app/actions/voice-cloning";
import { CreateVideoAgentForm } from "@/components/dashboard/video-agent/create-video-agent-form";
import type { PickableAvatar } from "@/components/dashboard/video-avatars/avatar-picker";
import type { VoiceCardData } from "@/components/dashboard/voice-cloning/voice-card";
import { Button } from "@/components/ui/button";
import { DEFAULT_VOICES } from "@/lib/dashboard/voice-cloning/default-voices";
import { getCreditsBalance } from "@/lib/dashboard/voice-cloning/credits";
import { requireUser } from "@/lib/auth/utils";
import { createInsforgeServerClient } from "@/lib/insforge/server";

export default async function NewAiVideoAgentPage() {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const [{ data: avatarRows }, { data: voiceClones }, creditsBalance, previewMap] = await Promise.all([
    client.database
      .from("avatars")
      .select("id, source, style, crop_16_9_url, crop_9_16_url")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false }),
    client.database
      .from("voice_clones")
      .select("id, name, status, cloned_audio_url")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false }),
    getCreditsBalance(client, user.id),
    warmDefaultVoicePreviews(),
  ]);

  const avatars: PickableAvatar[] = (avatarRows ?? []).filter((avatar) => avatar.crop_16_9_url || avatar.crop_9_16_url);

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
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.04em] text-foreground">Create AI Video Agent Video</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A fully edited video with an avatar, B-roll, captions, and voiceover.
        </p>
      </header>

      <CreateVideoAgentForm avatars={avatars} creditsBalance={creditsBalance} customVoices={customVoices} defaultVoices={defaultVoices} />
    </div>
  );
}
