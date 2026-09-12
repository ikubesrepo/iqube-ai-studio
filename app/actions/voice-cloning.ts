"use server";

import { revalidatePath } from "next/cache";
import { auth, tasks } from "@trigger.dev/sdk";

import { createInsforgeServerClient } from "@/lib/insforge/server";
import { createInsforgeAdminClient } from "@/lib/insforge/admin";
import { requireUser } from "@/lib/auth/utils";
import { ensureUserCredits, getCreditsBalance } from "@/lib/dashboard/voice-cloning/credits";
import { DEFAULT_VOICES, findDefaultVoice, PREVIEW_SAMPLE_TEXT } from "@/lib/dashboard/voice-cloning/default-voices";

const VOICES_BUCKET = "voices";
const TEXT_MAX_LENGTH = 2000;
const CREDITS_PER_BLOCK = 10;
const CHARS_PER_BLOCK = 500;

function computeCreditsCost(textLength: number) {
  return Math.ceil(textLength / CHARS_PER_BLOCK) * CREDITS_PER_BLOCK;
}

async function uploadFile(
  client: Awaited<ReturnType<typeof createInsforgeServerClient>>,
  path: string,
  file: Blob,
) {
  const { data, error } = await client.storage.from(VOICES_BUCKET).upload(path, file);

  if (error || !data) {
    throw new Error(error?.message || "Failed to upload file");
  }

  return { url: data.url, key: data.key };
}

function extensionForBlob(file: Blob) {
  if (file.type.includes("wav")) return "wav";
  if (file.type.includes("mpeg") || file.type.includes("mp3")) return "mp3";
  if (file.type.includes("ogg")) return "ogg";
  if (file.type.includes("webm")) return "webm";
  if (file.type.includes("m4a") || file.type.includes("mp4") || file.type.includes("x-m4a")) return "m4a";
  return "audio";
}

export async function createVoiceCloneAction(formData: FormData) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const name = formData.get("name");
  const sample = formData.get("sample");

  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Give your voice a name.");
  }

  if (!(sample instanceof Blob) || sample.size === 0) {
    throw new Error("Upload a voice sample before starting.");
  }

  const trimmedName = name.trim();
  const upload = await uploadFile(client, `uploads/${user.id}-${Date.now()}-sample.${extensionForBlob(sample)}`, sample);

  const { data: created, error } = await client.database
    .from("voice_clones")
    .insert([
      {
        user_id: user.id,
        name: trimmedName,
        status: "pending",
        sample_audio_url: upload.url,
        sample_audio_key: upload.key,
      },
    ])
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(error?.message || "Failed to create voice clone record");
  }

  const handle = await tasks.trigger("clone-voice", {
    voiceCloneId: created.id,
    userId: user.id,
    name: trimmedName,
    sampleAudioUrl: upload.url,
    sampleAudioKey: upload.key,
  });

  await client.database.from("voice_clones").update({ trigger_run_id: handle.id }).eq("id", created.id);

  const publicToken = await auth.createPublicToken({
    scopes: { read: { runs: [handle.id] } },
    expirationTime: "1h",
  });

  revalidatePath("/dashboard/ai-voice-cloning");

  return { voiceCloneId: created.id as string, runId: handle.id, publicToken };
}

export async function getVoiceCloneStatusAction(voiceCloneId: string) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const { data, error } = await client.database
    .from("voice_clones")
    .select("id, status, error_message, name, cloned_audio_url")
    .eq("id", voiceCloneId)
    .eq("user_id", user.id)
    .maybeSingle();

  revalidatePath("/dashboard/ai-voice-cloning");

  if (error || !data) {
    return null;
  }

  return data;
}

export async function deleteVoiceCloneAction(formData: FormData) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const voiceCloneId = formData.get("voiceCloneId");

  if (typeof voiceCloneId !== "string" || !voiceCloneId) {
    throw new Error("No voice specified");
  }

  const { data: voice, error: fetchError } = await client.database
    .from("voice_clones")
    .select("sample_audio_key, cloned_audio_key")
    .eq("id", voiceCloneId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !voice) {
    throw new Error("This voice could not be found. It may have already been deleted.");
  }

  const keys = [voice.sample_audio_key, voice.cloned_audio_key].filter((key): key is string => Boolean(key));

  if (keys.length > 0) {
    await client.storage.from(VOICES_BUCKET).remove(keys);
  }

  const { error: deleteError } = await client.database.from("voice_clones").delete().eq("id", voiceCloneId).eq("user_id", user.id);

  if (deleteError) {
    throw new Error("Couldn't delete this voice. Please try again.");
  }

  revalidatePath("/dashboard/ai-voice-cloning");
}

export async function getCreditsBalanceAction() {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const balance = await getCreditsBalance(client, user.id);

  return { balance };
}

export async function generateTtsAction(formData: FormData) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const text = formData.get("text");
  const voiceCloneId = formData.get("voiceCloneId");
  const defaultVoiceId = formData.get("defaultVoiceId");

  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Enter some text to generate speech.");
  }

  const trimmedText = text.trim();

  if (trimmedText.length > TEXT_MAX_LENGTH) {
    throw new Error(`Text must be ${TEXT_MAX_LENGTH} characters or fewer.`);
  }

  const hasVoiceClone = typeof voiceCloneId === "string" && voiceCloneId.length > 0;
  const hasDefaultVoice = typeof defaultVoiceId === "string" && defaultVoiceId.length > 0;

  if (hasVoiceClone === hasDefaultVoice) {
    throw new Error("Choose exactly one voice.");
  }

  let audioPromptUrl: string | null = null;
  let voiceLabel: string;

  if (hasVoiceClone) {
    const { data: voice, error } = await client.database
      .from("voice_clones")
      .select("name, status, cloned_audio_url")
      .eq("id", voiceCloneId)
      .eq("user_id", user.id)
      .single();

    if (error || !voice) {
      throw new Error("Voice not found");
    }

    if (voice.status !== "completed" || !voice.cloned_audio_url) {
      throw new Error("This voice clone isn't ready yet.");
    }

    audioPromptUrl = voice.cloned_audio_url;
    voiceLabel = voice.name;
  } else {
    const defaultVoice = findDefaultVoice(defaultVoiceId as string);

    if (!defaultVoice) {
      throw new Error("Unknown default voice");
    }

    const { data: preview } = await client.database
      .from("default_voice_previews")
      .select("preview_audio_url")
      .eq("voice_model_id", defaultVoice.id)
      .maybeSingle();

    if (!preview?.preview_audio_url) {
      throw new Error("This default voice isn't ready yet. Try previewing it first.");
    }

    audioPromptUrl = preview.preview_audio_url;
    voiceLabel = defaultVoice.name;
  }

  const cost = computeCreditsCost(trimmedText.length);

  await ensureUserCredits(user.id);

  const admin = createInsforgeAdminClient();
  const { data: deductResult, error: deductError } = await admin.database.rpc("deduct_credits", {
    p_user_id: user.id,
    p_amount: cost,
  });

  if (deductError || deductResult === null || deductResult === undefined) {
    throw new Error("Insufficient credits for this generation.");
  }

  const { data: created, error: insertError } = await client.database
    .from("tts_generations")
    .insert([
      {
        user_id: user.id,
        voice_clone_id: hasVoiceClone ? (voiceCloneId as string) : null,
        default_voice_id: hasDefaultVoice ? (defaultVoiceId as string) : null,
        voice_label: voiceLabel,
        input_text: trimmedText,
        credits_charged: cost,
        status: "pending",
      },
    ])
    .select("id")
    .single();

  if (insertError || !created) {
    await admin.database.rpc("refund_credits", { p_user_id: user.id, p_amount: cost });
    throw new Error(insertError?.message || "Failed to start generation");
  }

  try {
    const handle = await tasks.trigger("generate-voice-tts", {
      ttsGenerationId: created.id,
      userId: user.id,
      text: trimmedText,
      audioPromptUrl,
      creditsCharged: cost,
    });

    await client.database.from("tts_generations").update({ trigger_run_id: handle.id }).eq("id", created.id);

    const publicToken = await auth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
      expirationTime: "1h",
    });

    revalidatePath("/dashboard/ai-voice-cloning");
    revalidatePath("/dashboard", "layout");

    return {
      ttsGenerationId: created.id as string,
      runId: handle.id,
      publicToken,
      creditsCharged: cost,
      remainingBalance: deductResult as number,
    };
  } catch (err) {
    await admin.database.rpc("refund_credits", { p_user_id: user.id, p_amount: cost });
    await client.database.from("tts_generations").delete().eq("id", created.id);
    throw err;
  }
}

export async function deleteTtsGenerationAction(formData: FormData) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const ttsGenerationId = formData.get("ttsGenerationId");

  if (typeof ttsGenerationId !== "string" || !ttsGenerationId) {
    throw new Error("No result specified");
  }

  const { data: generation, error: fetchError } = await client.database
    .from("tts_generations")
    .select("audio_key")
    .eq("id", ttsGenerationId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !generation) {
    throw new Error("This result could not be found. It may have already been deleted.");
  }

  if (generation.audio_key) {
    await client.storage.from(VOICES_BUCKET).remove([generation.audio_key]);
  }

  const { error: deleteError } = await client.database
    .from("tts_generations")
    .delete()
    .eq("id", ttsGenerationId)
    .eq("user_id", user.id);

  if (deleteError) {
    throw new Error("Couldn't delete this result. Please try again.");
  }

  revalidatePath("/dashboard/ai-voice-cloning");
}

export async function getOrCreateDefaultVoicePreviewAction(voiceModelId: string) {
  const defaultVoice = findDefaultVoice(voiceModelId);

  if (!defaultVoice) {
    throw new Error("Unknown default voice");
  }

  const admin = createInsforgeAdminClient();

  const { data: cached } = await admin.database
    .from("default_voice_previews")
    .select("preview_audio_url")
    .eq("voice_model_id", voiceModelId)
    .maybeSingle();

  if (cached?.preview_audio_url) {
    return { url: cached.preview_audio_url };
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    throw new Error("Deepgram is not configured yet.");
  }

  const response = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(voiceModelId)}&encoding=mp3`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: PREVIEW_SAMPLE_TEXT }),
  });

  if (!response.ok) {
    throw new Error(`Deepgram preview request failed: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const blob = new Blob([new Uint8Array(buffer)], { type: "audio/mpeg" });
  const path = `previews/${voiceModelId}.mp3`;

  const { data: upload, error: uploadError } = await admin.storage.from(VOICES_BUCKET).upload(path, blob);

  if (uploadError || !upload) {
    throw new Error(uploadError?.message || "Failed to store preview audio");
  }

  await admin.database.from("default_voice_previews").insert([
    {
      voice_model_id: voiceModelId,
      preview_audio_url: upload.url,
      preview_audio_key: upload.key,
    },
  ]);

  return { url: upload.url };
}

export async function warmDefaultVoicePreviews() {
  const results = await Promise.all(
    DEFAULT_VOICES.map(async (voice) => {
      try {
        const { url } = await getOrCreateDefaultVoicePreviewAction(voice.id);
        return { id: voice.id, url };
      } catch {
        return { id: voice.id, url: null as string | null };
      }
    }),
  );

  return Object.fromEntries(results.map((result) => [result.id, result.url]));
}
