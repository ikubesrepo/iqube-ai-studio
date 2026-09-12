import { warmDefaultVoicePreviews } from "@/app/actions/voice-cloning";
import { VoiceCloningJobsProvider } from "@/components/dashboard/voice-cloning/active-jobs-tracker";
import { VoiceCloningTabs } from "@/components/dashboard/voice-cloning/voice-cloning-tabs";
import type { VoiceCardData } from "@/components/dashboard/voice-cloning/voice-card";
import type { TtsResultData } from "@/components/dashboard/voice-cloning/tts-result-card";
import { DEFAULT_VOICES } from "@/lib/dashboard/voice-cloning/default-voices";
import { getCreditsBalance } from "@/lib/dashboard/voice-cloning/credits";
import { requireUser } from "@/lib/auth/utils";
import { createInsforgeServerClient } from "@/lib/insforge/server";

export default async function AiVoiceCloningPage() {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const [{ data: voiceClones }, { data: ttsGenerations }, creditsBalance, previewMap] = await Promise.all([
    client.database
      .from("voice_clones")
      .select("id, name, status, cloned_audio_url")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    client.database
      .from("tts_generations")
      .select("id, voice_label, input_text, credits_charged, status, error_message, audio_url")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    getCreditsBalance(client, user.id),
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

  const ttsResults: TtsResultData[] = (ttsGenerations ?? []).map((result) => ({
    id: result.id,
    voice_label: result.voice_label,
    input_text: result.input_text,
    credits_charged: result.credits_charged,
    status: result.status,
    error_message: result.error_message,
    audio_url: result.audio_url,
  }));

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.18em] text-primary/75">VOICE CLONING</p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.04em] text-foreground">AI Voice Cloning</h1>
          <p className="mt-2 text-sm text-muted-foreground">Clone your voice from a short sample, then generate natural speech from any text.</p>
        </div>
      </header>

      <VoiceCloningJobsProvider>
        <VoiceCloningTabs
          creditsBalance={creditsBalance}
          customVoices={customVoices}
          defaultVoices={defaultVoices}
          ttsResults={ttsResults}
        />
      </VoiceCloningJobsProvider>
    </div>
  );
}
