"use client";

import { useState } from "react";
import { SparklesIcon } from "lucide-react";

import { getOrCreateDefaultVoicePreviewAction } from "@/app/actions/voice-cloning";
import { CreateVoiceDialog } from "@/components/dashboard/voice-cloning/create-voice-dialog";
import { GenerateTtsDialog, type SelectableVoice } from "@/components/dashboard/voice-cloning/generate-tts-dialog";
import { TtsResultCard, type TtsResultData } from "@/components/dashboard/voice-cloning/tts-result-card";
import { VoiceCard, type VoiceCardData } from "@/components/dashboard/voice-cloning/voice-card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function VoiceCloningTabs({
  customVoices,
  defaultVoices,
  ttsResults,
  creditsBalance,
}: {
  customVoices: VoiceCardData[];
  defaultVoices: VoiceCardData[];
  ttsResults: TtsResultData[];
  creditsBalance: number;
}) {
  const [activeTab, setActiveTab] = useState("clone");
  const [ttsDialogOpen, setTtsDialogOpen] = useState(false);
  const [initialVoiceValue, setInitialVoiceValue] = useState<string | null>(null);

  const selectableVoices: SelectableVoice[] = [
    ...customVoices
      .filter((voice) => voice.status === "completed")
      .map((voice) => ({ value: voice.id, label: voice.name, group: "Your Voices" as const, isDefault: false })),
    ...defaultVoices.map((voice) => ({ value: voice.id, label: voice.name, group: "Default Voices" as const, isDefault: true })),
  ];

  function handleUseForTts(voice: VoiceCardData) {
    setInitialVoiceValue(voice.id);
    setActiveTab("tts");
    setTtsDialogOpen(true);
  }

  function handleOpenGenerateDialog() {
    setInitialVoiceValue(null);
    setTtsDialogOpen(true);
  }

  async function handleDefaultPreview(voice: VoiceCardData) {
    const { url } = await getOrCreateDefaultVoicePreviewAction(voice.id);
    return url;
  }

  return (
    <Tabs onValueChange={(value) => setActiveTab(value as string)} value={activeTab}>
      <TabsList variant="line">
        <TabsTrigger value="clone">AI Voice Cloning</TabsTrigger>
        <TabsTrigger value="tts">Voice Cloning TTS</TabsTrigger>
      </TabsList>

      <TabsContent className="mt-6 space-y-10" value="clone">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-lg font-semibold tracking-[-0.02em]">Your Cloned Voices</h2>
            <p className="mt-1 text-sm text-muted-foreground">Clone your own voice from a short sample.</p>
          </div>
          <CreateVoiceDialog />
        </div>

        {customVoices.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {customVoices.map((voice) => (
              <VoiceCard key={voice.id} onUse={handleUseForTts} voice={voice} />
            ))}
          </div>
        ) : (
          <div className="rounded-[calc(var(--radius)*1.5)] border border-dashed border-border/60 bg-card/40 p-8 text-center text-sm text-muted-foreground">
            You haven&apos;t cloned any voices yet. Use &quot;Add New Voice Clone&quot; to get started.
          </div>
        )}

        <div>
          <h2 className="mb-4 font-heading text-lg font-semibold tracking-[-0.02em]">Default Voices</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {defaultVoices.map((voice) => (
              <VoiceCard key={voice.id} onPreviewRequested={handleDefaultPreview} onUse={handleUseForTts} voice={voice} />
            ))}
          </div>
        </div>
      </TabsContent>

      <TabsContent className="mt-6 space-y-6" value="tts">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-lg font-semibold tracking-[-0.02em]">Generated Audio</h2>
            <p className="mt-1 text-sm text-muted-foreground">Generate speech using your cloned or default voices.</p>
          </div>
          <Button onClick={handleOpenGenerateDialog} size="lg">
            <SparklesIcon />
            Generate Text to Speech
          </Button>
          <GenerateTtsDialog
            creditsBalance={creditsBalance}
            initialVoiceValue={initialVoiceValue}
            onOpenChange={setTtsDialogOpen}
            open={ttsDialogOpen}
            voices={selectableVoices}
          />
        </div>

        {ttsResults.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ttsResults.map((result) => (
              <TtsResultCard key={result.id} result={result} />
            ))}
          </div>
        ) : (
          <div className="rounded-[calc(var(--radius)*1.5)] border border-dashed border-border/60 bg-card/40 p-8 text-center text-sm text-muted-foreground">
            No generated audio yet. Use &quot;Generate Text to Speech&quot; to create your first one.
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
