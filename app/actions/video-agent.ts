"use server";

import { revalidatePath } from "next/cache";
import { auth, tasks } from "@trigger.dev/sdk";
import { GoogleGenAI } from "@google/genai";

import { createInsforgeServerClient } from "@/lib/insforge/server";
import { createInsforgeAdminClient } from "@/lib/insforge/admin";
import { requireUser } from "@/lib/auth/utils";
import { ensureUserCredits, getCreditsBalance } from "@/lib/dashboard/voice-cloning/credits";
import { findDefaultVoice } from "@/lib/dashboard/voice-cloning/default-voices";
import {
  isBRollStyle,
  isVideoAgentDuration,
  estimateVideoAgentCreditsCost,
  type BRollStyle,
  type VideoAgentDurationSeconds,
} from "@/lib/dashboard/video-agent/pricing";
import { CAPTION_PRESETS } from "@/remotion/captionPresets";
import type { CaptionStyleId, TransitionStyleId } from "@/remotion/types";

const SCRIPT_MAX_LENGTH = 20000;
const WORDS_PER_MINUTE = 150;
const REFINEMENT_NOTES_MAX_LENGTH = 2000;
const TRANSITION_STYLES: TransitionStyleId[] = ["crossfade", "hard_cut", "none"];

function isCaptionStyle(value: FormDataEntryValue | null): value is CaptionStyleId {
  return typeof value === "string" && CAPTION_PRESETS.some((preset) => preset.id === value);
}

function isTransitionStyle(value: FormDataEntryValue | null): value is TransitionStyleId {
  return typeof value === "string" && TRANSITION_STYLES.includes(value as TransitionStyleId);
}

function isAspectRatio(value: FormDataEntryValue | null): value is "16:9" | "9:16" {
  return value === "16:9" || value === "9:16";
}

export async function generateProjectScriptAction(formData: FormData) {
  await requireUser();

  const topic = formData.get("topic");
  const durationSecondsRaw = Number(formData.get("durationSeconds"));

  if (typeof topic !== "string" || !topic.trim()) {
    throw new Error("Enter a topic for the script.");
  }

  if (!isVideoAgentDuration(durationSecondsRaw)) {
    throw new Error("Choose a video length before generating a script.");
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini is not configured yet.");
  }

  const targetWords = Math.round((durationSecondsRaw / 60) * WORDS_PER_MINUTE);

  const ai = new GoogleGenAI({ apiKey });
  const prompt = [
    `Write a complete, natural-sounding video script for a short-form video to be narrated aloud.`,
    `Topic: ${topic.trim()}`,
    `The video is exactly ${durationSecondsRaw} seconds long -- write approximately ${targetWords} words so it takes about that long to narrate at a natural pace.`,
    "Write spoken-language only (no stage directions, headings, scene labels, or emojis) -- just the words to be said.",
  ].join("\n");

  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: prompt,
  });

  const script = response.text?.trim();

  if (!script) {
    throw new Error("Gemini did not return a script. Try a different topic.");
  }

  return { script: script.slice(0, SCRIPT_MAX_LENGTH) };
}

export async function generateVideoAgentAction(formData: FormData) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const title = formData.get("title");
  const scriptSourceRaw = formData.get("scriptSource");
  const topic = formData.get("topic");
  const script = formData.get("script");
  const avatarId = formData.get("avatarId");
  const voiceCloneId = formData.get("voiceCloneId");
  const defaultVoiceId = formData.get("defaultVoiceId");
  const aspectRatio = formData.get("aspectRatio");
  const durationSecondsRaw = Number(formData.get("durationSeconds"));
  const captionStyle = formData.get("captionStyle");
  const bRollStyleRaw = formData.get("bRollStyle");
  const refinementNotesRaw = formData.get("refinementNotes");
  const transitionStyleRaw = formData.get("transitionStyle");

  if (typeof title !== "string" || !title.trim()) {
    throw new Error("Give your video a name.");
  }

  const scriptSource = scriptSourceRaw === "ai_topic" ? "ai_topic" : "manual";

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

  if (!isVideoAgentDuration(durationSecondsRaw)) {
    throw new Error("Choose a video length.");
  }

  if (!isCaptionStyle(captionStyle)) {
    throw new Error("Choose a caption design.");
  }

  if (!isBRollStyle(bRollStyleRaw)) {
    throw new Error("Choose a B-roll style.");
  }

  const durationSeconds: VideoAgentDurationSeconds = durationSecondsRaw;
  const bRollStyle: BRollStyle = bRollStyleRaw;

  const transitionStyle: TransitionStyleId = isTransitionStyle(transitionStyleRaw) ? transitionStyleRaw : "crossfade";
  const refinementNotes =
    typeof refinementNotesRaw === "string" && refinementNotesRaw.trim()
      ? refinementNotesRaw.trim().slice(0, REFINEMENT_NOTES_MAX_LENGTH)
      : undefined;

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

    defaultVoiceModelId = defaultVoice.id;
    voiceLabel = defaultVoice.name;
  }

  const cost = estimateVideoAgentCreditsCost(durationSeconds, bRollStyle);

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
    .from("video_agent_projects")
    .insert([
      {
        user_id: user.id,
        avatar_id: avatarId,
        voice_clone_id: hasVoiceClone ? (voiceCloneId as string) : null,
        default_voice_id: hasDefaultVoice ? (defaultVoiceId as string) : null,
        avatar_label: avatarLabel,
        voice_label: voiceLabel,
        title: title.trim(),
        script_source: scriptSource,
        topic: typeof topic === "string" && topic.trim() ? topic.trim() : null,
        script: trimmedScript,
        duration_seconds: durationSeconds,
        aspect_ratio: aspectRatio,
        caption_style: captionStyle,
        b_roll_style: bRollStyle,
        credits_charged: cost,
        status: "pending",
        thumbnail_url: avatarImageUrl,
        transition_style: transitionStyle,
        refinement_notes: refinementNotes ?? null,
      },
    ])
    .select("id")
    .single();

  if (insertError || !created) {
    await admin.database.rpc("refund_credits", { p_user_id: user.id, p_amount: cost });
    throw new Error(insertError?.message || "Failed to start generation");
  }

  try {
    const handle = await tasks.trigger("generate-video-agent", {
      projectId: created.id,
      userId: user.id,
      script: trimmedScript,
      durationSeconds,
      aspectRatio,
      captionStyle,
      bRollStyle,
      avatarImageUrl,
      voiceCloneAudioUrl,
      defaultVoiceModelId,
      creditsCharged: cost,
      refinementNotes,
      transitionStyle,
    });

    await client.database.from("video_agent_projects").update({ trigger_run_id: handle.id }).eq("id", created.id);

    const publicToken = await auth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
      expirationTime: "2h",
    });

    revalidatePath("/dashboard/ai-video-agent");
    revalidatePath("/dashboard", "layout");

    return {
      projectId: created.id as string,
      runId: handle.id,
      publicToken,
      creditsCharged: cost,
      remainingBalance: deductResult as number,
    };
  } catch (err) {
    await admin.database.rpc("refund_credits", { p_user_id: user.id, p_amount: cost });
    await client.database.from("video_agent_projects").delete().eq("id", created.id);
    throw err;
  }
}

export async function renderVideoAgentAction(projectId: string) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();
  const admin = createInsforgeAdminClient();

  const { data: project, error } = await client.database
    .from("video_agent_projects")
    .select("id, status, composition_data, credits_charged")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (error || !project) {
    throw new Error("Video not found.");
  }

  // A prepare-phase failure also lands status:"failed" but with no
  // composition_data -- this check is what stops that case from being
  // mistaken for a "retry render" case below.
  if (!project.composition_data) {
    throw new Error("Composition isn't ready to render yet.");
  }

  const isRetry = project.status === "failed";

  if (project.status !== "awaiting_render" && !isRetry) {
    throw new Error("This video isn't ready to render.");
  }

  // Atomic claim before charging: a second concurrent call reads the same
  // pre-claim status, its own conditional update matches zero rows (this
  // one already flipped it), so it throws here with nothing charged yet.
  const { data: claimed } = await client.database
    .from("video_agent_projects")
    .update({ status: "processing" })
    .eq("id", projectId)
    .eq("status", project.status)
    .select("id")
    .single();

  if (!claimed) {
    throw new Error("A render is already in progress for this video.");
  }

  if (isRetry) {
    const { data: deductResult, error: deductError } = await admin.database.rpc("deduct_credits", {
      p_user_id: user.id,
      p_amount: project.credits_charged,
    });

    if (deductError || deductResult === null || deductResult === undefined) {
      await client.database.from("video_agent_projects").update({ status: "failed" }).eq("id", projectId);
      throw new Error("Insufficient credits to retry rendering.");
    }
  }

  try {
    const handle = await tasks.trigger("render-video-agent", {
      projectId,
      userId: user.id,
      creditsCharged: project.credits_charged,
    });

    await client.database.from("video_agent_projects").update({ render_trigger_run_id: handle.id }).eq("id", projectId);

    const publicToken = await auth.createPublicToken({
      scopes: { read: { runs: [handle.id] } },
      expirationTime: "2h",
    });

    revalidatePath("/dashboard/ai-video-agent");

    return { runId: handle.id, publicToken };
  } catch (err) {
    if (isRetry) {
      await admin.database.rpc("refund_credits", { p_user_id: user.id, p_amount: project.credits_charged });
    }
    await client.database.from("video_agent_projects").update({ status: project.status }).eq("id", projectId);
    throw err;
  }
}

export async function getVideoAgentProjectStatusAction(projectId: string) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const { data, error } = await client.database
    .from("video_agent_projects")
    .select("id, status, error_message, video_url, thumbnail_url, title, composition_data, scenes_total, scenes_completed")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  revalidatePath("/dashboard/ai-video-agent");

  if (error || !data) {
    return null;
  }

  return data;
}

export async function deleteVideoAgentProjectAction(formData: FormData) {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const projectId = formData.get("projectId");

  if (typeof projectId !== "string" || !projectId) {
    throw new Error("No video specified");
  }

  const { data: project, error: fetchError } = await client.database
    .from("video_agent_projects")
    .select("video_key, narration_audio_key")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !project) {
    throw new Error("This video could not be found. It may have already been deleted.");
  }

  const { data: scenes } = await client.database
    .from("video_agent_scenes")
    .select("avatar_clip_key, b_roll_key")
    .eq("project_id", projectId)
    .eq("user_id", user.id);

  const keys = [
    project.video_key,
    project.narration_audio_key,
    ...(scenes ?? []).flatMap((scene) => [scene.avatar_clip_key, scene.b_roll_key]),
  ].filter((key): key is string => Boolean(key));

  if (keys.length > 0) {
    await client.storage.from("video-agent").remove(keys);
  }

  const { error: deleteError } = await client.database.from("video_agent_projects").delete().eq("id", projectId).eq("user_id", user.id);

  if (deleteError) {
    throw new Error("Couldn't delete this video. Please try again.");
  }

  revalidatePath("/dashboard/ai-video-agent");
}

export async function getVideoAgentCreditsBalanceAction() {
  const user = await requireUser();
  const client = await createInsforgeServerClient();

  const balance = await getCreditsBalance(client, user.id);

  return { balance };
}
