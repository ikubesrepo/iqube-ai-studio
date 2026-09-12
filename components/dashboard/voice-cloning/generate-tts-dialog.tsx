"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2Icon, SparklesIcon } from "lucide-react";

import { generateTtsAction } from "@/app/actions/voice-cloning";
import { useVoiceCloningJobs } from "@/components/dashboard/voice-cloning/active-jobs-tracker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

const TEXT_MAX_LENGTH = 2000;
const CREDITS_PER_BLOCK = 10;
const CHARS_PER_BLOCK = 500;

export type SelectableVoice = {
  value: string;
  label: string;
  group: "Your Voices" | "Default Voices";
  isDefault: boolean;
};

export function GenerateTtsDialog({
  voices,
  creditsBalance,
  open,
  onOpenChange,
  initialVoiceValue,
}: {
  voices: SelectableVoice[];
  creditsBalance: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialVoiceValue?: string | null;
}) {
  const dialogOpen = open;
  const setDialogOpen = onOpenChange;

  const [voiceValue, setVoiceValue] = useState<string>(initialVoiceValue ?? voices[0]?.value ?? "");
  const [text, setText] = useState("");
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setVoiceValue(initialVoiceValue ?? voices[0]?.value ?? "");
    }
  }

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();
  const { startJob } = useVoiceCloningJobs();

  const cost = useMemo(() => Math.ceil(text.length / CHARS_PER_BLOCK) * CREDITS_PER_BLOCK, [text]);
  const insufficientCredits = cost > creditsBalance;
  const yourVoices = voices.filter((voice) => voice.group === "Your Voices");
  const defaultVoices = voices.filter((voice) => voice.group === "Default Voices");
  const selectedVoice = voices.find((voice) => voice.value === voiceValue);

  function reset() {
    setText("");
    setErrorMessage(null);
  }

  function handleSubmit() {
    if (!voiceValue || !text.trim() || insufficientCredits) return;

    startSubmit(async () => {
      setErrorMessage(null);
      const formData = new FormData();
      formData.set("text", text.trim());
      if (selectedVoice?.isDefault) {
        formData.set("defaultVoiceId", voiceValue);
      } else {
        formData.set("voiceCloneId", voiceValue);
      }

      try {
        const { runId, publicToken } = await generateTtsAction(formData);
        setDialogOpen(false);
        reset();
        startJob({ kind: "tts", runId, publicToken, label: selectedVoice?.label ?? "voice" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to start generation";
        setErrorMessage(message);
        toast.add({ type: "error", title: "Couldn't start generation", description: message });
      }
    });
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        setDialogOpen(next);
        if (!next) reset();
      }}
      open={dialogOpen}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Text to Speech</DialogTitle>
          <DialogDescription>Pick a voice and enter the text you&apos;d like spoken.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label htmlFor="tts-voice">Voice</Label>
            <Select onValueChange={(value) => setVoiceValue(value ?? "")} value={voiceValue}>
              <SelectTrigger className="mt-2 w-full" id="tts-voice">
                <SelectValue placeholder="Choose a voice">{() => selectedVoice?.label ?? "Choose a voice"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {yourVoices.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>Your Voices</SelectLabel>
                    {yourVoices.map((voice) => (
                      <SelectItem key={voice.value} value={voice.value}>
                        {voice.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
                <SelectGroup>
                  <SelectLabel>Default Voices</SelectLabel>
                  {defaultVoices.map((voice) => (
                    <SelectItem key={voice.value} value={voice.value}>
                      {voice.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="tts-text">Text</Label>
              <span className={`text-xs ${text.length > TEXT_MAX_LENGTH ? "text-destructive" : "text-muted-foreground"}`}>
                {text.length}/{TEXT_MAX_LENGTH}
              </span>
            </div>
            <Textarea
              className="mt-2 min-h-32"
              id="tts-text"
              maxLength={TEXT_MAX_LENGTH}
              onChange={(event) => setText(event.target.value)}
              placeholder="Enter the text you want to convert to speech…"
              value={text}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-accent/20 px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">10 credits / 500 characters</span>
            <span className={`font-semibold ${insufficientCredits ? "text-destructive" : "text-foreground"}`}>
              {cost} credits · {creditsBalance} available
            </span>
          </div>

          {insufficientCredits ? (
            <p className="text-sm text-destructive">You don&apos;t have enough credits for this generation.</p>
          ) : null}

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
        </div>

        <DialogFooter>
          <Button onClick={() => setDialogOpen(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={!voiceValue || !text.trim() || insufficientCredits || isSubmitting} onClick={handleSubmit}>
            {isSubmitting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            Generate Text to Speech
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
