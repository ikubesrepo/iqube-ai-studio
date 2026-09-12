"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, PlusIcon, UploadIcon } from "lucide-react";

import { createVoiceCloneAction } from "@/app/actions/voice-cloning";
import { useVoiceCloningJobs } from "@/components/dashboard/voice-cloning/active-jobs-tracker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

export function CreateVoiceDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();
  const { startJob } = useVoiceCloningJobs();

  function reset() {
    setName("");
    setFile(null);
    setErrorMessage(null);
  }

  function handleSubmit() {
    if (!file || !name.trim()) return;

    startSubmit(async () => {
      setErrorMessage(null);
      const formData = new FormData();
      formData.set("name", name.trim());
      formData.set("sample", file);

      try {
        const { runId, publicToken } = await createVoiceCloneAction(formData);
        setOpen(false);
        reset();
        startJob({ kind: "clone", runId, publicToken, label: name.trim() });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to start voice cloning";
        setErrorMessage(message);
        toast.add({ type: "error", title: "Couldn't start cloning", description: message });
      }
    });
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
      open={open}
    >
      <DialogTrigger render={<Button size="lg" />}>
        <PlusIcon />
        Add New Voice Clone
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Voice Clone</DialogTitle>
          <DialogDescription>Upload a ~10 second voice sample and give it a name. Cloning runs in the background.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label htmlFor="voice-sample">Voice sample</Label>
            <label
              className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/70 bg-accent/30 p-6 text-center transition hover:bg-accent/50"
              htmlFor="voice-sample"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const dropped = event.dataTransfer.files?.[0];
                if (dropped) setFile(dropped);
              }}
            >
              <UploadIcon className="size-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {file ? file.name : "Drag & drop, or click to choose a ~10 second audio clip"}
              </span>
              <input
                accept="audio/*"
                className="hidden"
                id="voice-sample"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                type="file"
              />
            </label>
          </div>

          <div>
            <Label htmlFor="voice-name">Voice name</Label>
            <Input
              className="mt-2"
              id="voice-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. My Podcast Voice"
              value={name}
            />
          </div>

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
        </div>

        <DialogFooter>
          <Button onClick={() => setOpen(false)} variant="outline">
            Cancel
          </Button>
          <Button disabled={!file || !name.trim() || isSubmitting} onClick={handleSubmit}>
            {isSubmitting ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            Start Cloning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
