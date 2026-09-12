"use server";

import { revalidatePath } from "next/cache";
import { auth, tasks } from "@trigger.dev/sdk";
import { GoogleGenAI } from "@google/genai";

import { createInsforgeServerClient } from "@/lib/insforge/server";
import { createInsforgeAdminClient } from "@/lib/insforge/admin";
import { requireUser } from "@/lib/auth/utils";
import { ensureUserCredits, getCreditsBalance } from "@/lib/dashboard/voice-cloning/credits";
import { findDefaultVoice } from "@/lib/dashboard/voice-cloning/default-voices";
import { computeVideoCreditsCost, isVideoDurationSeconds } from "@/lib/dashboard/video-avatars/pricing";

const SCRIPT_MAX_LENGTH = 4000;
const TONES = ["professional", "friendly", "energetic", "educational", "promotional"] as const;
type Tone = (typeof TONES)[number];

function isTone(value: FormDataEntryValue | null): value is Tone {
  return typeof value === "string" && (TONES as readonly string[]).includes(value);
}

function isAspectRatio(value: FormDataEntryValue | null): value is "16:9" | "9:16" {
  return value === "16:9" || value === "9:16";
}

export async function generateScriptAction(formData: FormData) {
  await requireUser();

  const topic = formData.get("topic");
  const tone = formData.get("tone");

  if (typeof topic !== "string" || !topic.trim()) {
    throw new Error("Enter a topic for the script.");
  }

  if (!isTone(tone)) {
    throw new Error("Choose a tone before generating.");
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini is not configured yet.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = [
    `Write a short, natural-sounding video script for a talking avatar to narrate aloud.`,
    `Topic: ${topic.trim()}`,
    `Tone: ${tone}`,
    `Keep it under 600 characters, spoken-language only (no stage directions, headings, or emojis).`,
  ].join("\n");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  const script = response.text?.trim();

  if (!script) {
    throw new Error("Gemini did not return a script. Try a different topic.");
  }

  return { script: script.slice(0, SCRIPT_MAX_LENGTH) };
}

export async function generateVideoAvatarAction(formData: FormData) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const script = formData.get("script");
  const avatarId = formData.get("avatarId");
  const voiceCloneId = formData.get("voiceCloneId");
  const defaultVoiceId = formData.get("defaultVoiceId");
  const aspectRatio = formData.get("aspectRatio");
  const durationSecondsRaw = formData.get("durationSeconds");
  const tone = formData.get("tone");

  if (typeof script !== "string" || !script.trim()) {
    throw new Error("Write or generate a script first.");
  }

  const trimmedScript = script.trim();

  if (trimmedScript.length > SCRIPT_MAX_LENGTH) {
    throw new Error(`Script must be ${SCRIPT_MAX_LENGTH} characters or fewer.`);
  }

  if (typeof avatarId !== "string" || !avatarId) {
    throw new Error("Select an avatar.");
  }

  if (!isAspectRatio(aspectRatio)) {
    throw new Error("Choose a screen size.");
  }

  const durationSeconds = Number(durationSecondsRaw);

  if (!isVideoDurationSeconds(durationSeconds)) {
    throw new Error("Choose a video duration.");
  }

  const hasVoiceClone = typeof voiceCloneId === "string" && voiceCloneId.length > 0;
  const hasDefaultVoice = typeof defaultVoiceId === "string" && defaultVoiceId.length > 0;

  if (hasVoiceClone === hasDefaultVoice) {
    throw new Error("Choose exactly one voice.");
  }

  const { data: avatar, error: avatarError } = await client.database
    .from("avatars")
    .select("id, style, source, status, crop_16_9_url, crop_9_16_url")
    .eq("id", avatarId)
    .eq("user_id", user.id)
    .single();

  if (avatarError || !avatar) {
    throw new Error("Avatar not found.");
  }

  if (avatar.status !== "completed") {
    throw new Error("This avatar isn't ready yet.");
  }

  const avatarImageUrl = aspectRatio === "16:9" ? avatar.crop_16_9_url : avatar.crop_9_16_url;

  if (!avatarImageUrl) {
    throw new Error(`This avatar doesn't have a ${aspectRatio} version. Pick the other screen size or a different avatar.`);
  }

  const avatarLabel =
    avatar.source === "default" ? "Default avatar" : avatar.style ? avatar.style.replace(/_/g, " ") : "Custom avatar";

  let voiceCloneAudioUrl: string | undefined;
  let defaultVoiceModelId: string | undefined;
  let voiceLabel: string;

  if (hasVoiceClone) {
    const { data: voice, error } = await client.database
      .from("voice_clones")
      .select("name, status, cloned_audio_url")
      .eq("id", voiceCloneId)
      .eq("user_id", user.id)
      .single();

    if (error || !voice) {
      throw new Error("Voice not found.");
    }

    if (voice.status !== "completed" || !voice.cloned_audio_url) {
      throw new Error("This voice clone isn't ready yet.");
    }

    voiceCloneAudioUrl = voice.cloned_audio_url;
    voiceLabel = voice.name;
  } else {
    const defaultVoice = findDefaultVoice(defaultVoiceId as string);

    if (!defaultVoice) {
      throw new Error("Unknown default voice.");
    }

    // Default voices are Deepgram Aura voices -- the task synthesizes the
    // script directly via Deepgram for these, so no reference audio (and no
    // Replicate call) is needed here.
    defaultVoiceModelId = defaultVoice.id;
    voiceLabel = defaultVoice.name;
  }

  const cost = computeVideoCreditsCost(durationSeconds);

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
    .from("avatar_videos")
    .insert([
      {
        user_id: user.id,
        avatar_id: avatarId,
        voice_clone_id: hasVoiceClone ? (voiceCloneId as string) : null,
        default_voice_id: hasDefaultVoice ? (defaultVoiceId as string) : null,
        avatar_label: avatarLabel,
        voice_label: voiceLabel,
        script: trimmedScript,
        tone: isTone(tone) ? tone : null,
        aspect_ratio: aspectRatio,
        duration_seconds: durationSeconds,
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
    const handle = await tasks.trigger("generate-video-avatar", {
      avatarVideoId: created.id,
      userId: user.id,
      script: trimmedScript,
      avatarImageUrl,
      voiceCloneAudioUrl,
      defaultVoiceModelId,
      aspectRatio,
      durationSeconds,
      creditsCharged: cost,
    });

    await client.database.from("avatar_videos").update({ trigger_run_id: handle.id }).eq("id", created.id);

    const publicToken = await auth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
      expirationTime: "1h",
    });

    revalidatePath("/dashboard/ai-video-avatar");
    revalidatePath("/dashboard", "layout");

    return {
      avatarVideoId: created.id as string,
      runId: handle.id,
      publicToken,
      creditsCharged: cost,
      remainingBalance: deductResult as number,
    };
  } catch (err) {
    await admin.database.rpc("refund_credits", { p_user_id: user.id, p_amount: cost });
    await client.database.from("avatar_videos").delete().eq("id", created.id);
    throw err;
  }
}

export async function getAvatarVideoStatusAction(avatarVideoId: string) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const { data, error } = await client.database
    .from("avatar_videos")
    .select("id, status, error_message, video_url, thumbnail_url, title")
    .eq("id", avatarVideoId)
    .eq("user_id", user.id)
    .maybeSingle();

  revalidatePath("/dashboard/ai-video-avatar");

  if (error || !data) {
    return null;
  }

  return data;
}

export async function deleteAvatarVideoAction(formData: FormData) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const avatarVideoId = formData.get("avatarVideoId");

  if (typeof avatarVideoId !== "string" || !avatarVideoId) {
    throw new Error("No video specified");
  }

  const { data: video, error: fetchError } = await client.database
    .from("avatar_videos")
    .select("video_key, thumbnail_key, narration_audio_key")
    .eq("id", avatarVideoId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !video) {
    throw new Error("This video could not be found. It may have already been deleted.");
  }

  const keys = [video.video_key, video.thumbnail_key, video.narration_audio_key].filter(
    (key): key is string => Boolean(key),
  );

  if (keys.length > 0) {
    await client.storage.from("avatar-videos").remove(keys);
  }

  const { error: deleteError } = await client.database.from("avatar_videos").delete().eq("id", avatarVideoId).eq("user_id", user.id);

  if (deleteError) {
    throw new Error("Couldn't delete this video. Please try again.");
  }

  revalidatePath("/dashboard/ai-video-avatar");
}

export async function getCreditsBalanceAction() {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const balance = await getCreditsBalance(client, user.id);

  return { balance };
}
