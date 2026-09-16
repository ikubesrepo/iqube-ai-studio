import { task, tasks, metadata } from "@trigger.dev/sdk";
import { z } from "zod";

import { createInsforgeAdminClient } from "@/lib/insforge/admin";
import { getAudioDurationSeconds } from "@/lib/dashboard/voice-cloning/audio";
import { synthesizeNarration } from "@/lib/dashboard/video-avatars/narration";
import { planScenes } from "@/lib/dashboard/video-agent/scene-planner";
import { transcribeWithTimestamps } from "@/lib/dashboard/video-agent/deepgram-stt";
import { realignSceneTiming } from "@/lib/dashboard/video-agent/scene-timing";
import { buildCompositionData } from "@/lib/dashboard/video-agent/composition-builder";
import { AVATAR_CLIP_SECONDS } from "@/remotion/types";

const payloadSchema = z.object({
  projectId: z.string(),
  userId: z.string(),
  script: z.string(),
  durationSeconds: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
  aspectRatio: z.enum(["16:9", "9:16"]),
  captionStyle: z.enum(["bold_subtitle", "minimal_clean", "podcast", "tiktok_viral", "gradient_highlight", "word_by_word"]),
  bRollStyle: z.enum(["ai_image", "stock", "ai_video", "ai_illustration"]),
  avatarImageUrl: z.string(),
  voiceCloneAudioUrl: z.string().optional(),
  defaultVoiceModelId: z.string().optional(),
  creditsCharged: z.number(),
  refinementNotes: z.string().optional(),
  transitionStyle: z.enum(["crossfade", "hard_cut", "none"]).default("crossfade"),
});

type Payload = z.infer<typeof payloadSchema>;

// These step labels are read verbatim by the create-video-agent-form's
// progress panel -- keep them byte-identical.
const STEPS = {
  preparingScript: "Preparing script",
  breakingIntoScenes: "Breaking script into scenes",
  generatingPrompts: "Generating prompts",
  generatingAvatarClips: "Generating avatar clips",
  generatingVoiceover: "Generating voiceover",
  generatingCaptions: "Generating captions",
  generatingBRoll: "Fetching or generating B-roll",
  creatingComposition: "Creating Remotion composition",
  savingAssets: "Saving assets",
  readyForPreview: "Ready for preview",
} as const;

export const generateVideoAgentTask = task({
  id: "generate-video-agent",
  maxDuration: 3600,
  run: async (rawPayload: Payload) => {
    const payload = payloadSchema.parse(rawPayload);
    const client = createInsforgeAdminClient();

    await client.database.from("video_agent_projects").update({ status: "processing" }).eq("id", payload.projectId);

    try {
      metadata.set("progress", { step: STEPS.preparingScript, percentage: 5 });

      metadata.set("progress", { step: STEPS.breakingIntoScenes, percentage: 12 });
      const plannedScenes = await planScenes(
        payload.script,
        payload.durationSeconds,
        payload.bRollStyle,
        payload.refinementNotes,
      );

      // Idempotency: if this is a Trigger.dev automatic retry (re-running
      // this whole function from scratch after a later step failed) or a
      // fresh user-triggered retry against the same project, scene rows
      // from the prior attempt may still exist and collide with the
      // (project_id, scene_index) unique constraint below.
      await client.database.from("video_agent_scenes").delete().eq("project_id", payload.projectId);

      const sceneRows = plannedScenes.map((scene, index) => ({
        project_id: payload.projectId,
        user_id: payload.userId,
        scene_index: index,
        title: scene.title,
        summary: scene.summary,
        // Provisional, LLM-estimated timing -- corrected below once the
        // real voiceover exists and is transcribed.
        start_time: scene.start_time,
        end_time: scene.end_time,
        voiceover_segment: scene.voiceover_segment,
        caption_text: scene.caption_text,
        has_b_roll: scene.b_roll_requirement,
        visual_prompt: scene.visual_prompt_or_keyword,
        starts_new_point: scene.starts_new_point,
        status: "pending" as const,
      }));

      const { data: insertedScenes, error: insertScenesError } = await client.database
        .from("video_agent_scenes")
        .insert(sceneRows)
        .select("id, scene_index, voiceover_segment, visual_prompt, has_b_roll, starts_new_point");

      if (insertScenesError || !insertedScenes) {
        throw new Error(insertScenesError?.message || "Failed to save scene breakdown");
      }

      metadata.set("progress", { step: STEPS.generatingPrompts, percentage: 20 });

      metadata.set("progress", { step: STEPS.generatingAvatarClips, percentage: 28 });

      metadata.set("progress", { step: STEPS.generatingVoiceover, percentage: 40 });
      const narrationMp3 = await synthesizeNarration(payload.script, {
        voiceCloneAudioUrl: payload.voiceCloneAudioUrl,
        defaultVoiceModelId: payload.defaultVoiceModelId,
      });

      // Safety net against a TTS provider silently truncating long text
      // (observed with Chatterbox on long scripts, chunked/stitched in
      // narration.ts, but this check catches any provider/regression):
      // fail loudly with a clear, refundable error rather than silently
      // shipping a video shorter than the user requested. 70% tolerance
      // allows for scripts that naturally narrate a bit faster/slower than
      // the 150wpm pacing assumption used to size the script.
      const narrationDurationSeconds = await getAudioDurationSeconds(narrationMp3);
      const minAcceptableSeconds = payload.durationSeconds * 0.7;

      if (narrationDurationSeconds < minAcceptableSeconds) {
        throw new Error(
          `Narration came out to ${narrationDurationSeconds.toFixed(1)}s, well short of the requested ${payload.durationSeconds}s ` +
            "(the voice provider likely truncated a long script) -- please try again.",
        );
      }

      const narrationPath = `narration/${payload.projectId}.mp3`;
      const { data: narrationUpload, error: narrationError } = await client.storage
        .from("video-agent")
        .upload(narrationPath, new Blob([new Uint8Array(narrationMp3)], { type: "audio/mpeg" }));

      if (narrationError || !narrationUpload) {
        throw new Error(narrationError?.message || "Failed to upload narration audio");
      }

      await client.database
        .from("video_agent_projects")
        .update({ narration_audio_url: narrationUpload.url, narration_audio_key: narrationUpload.key })
        .eq("id", payload.projectId);

      metadata.set("progress", { step: STEPS.generatingCaptions, percentage: 52 });
      const captions = await transcribeWithTimestamps(narrationMp3);
      await client.database.from("video_agent_projects").update({ captions_data: captions }).eq("id", payload.projectId);

      // Re-derive each scene's real timing from the actual synthesized
      // voiceover (word-count aligned against the real transcript) instead
      // of trusting the LLM's pre-audio estimate -- keeps B-roll/avatar-clip
      // cuts in sync with what's actually being said.
      const allWords = captions.flatMap((cue) => cue.words ?? []);
      const sortedInsertedScenes = [...insertedScenes].sort((a, b) => a.scene_index - b.scene_index);
      const realignedTimings = realignSceneTiming(
        sortedInsertedScenes.map((scene) => scene.voiceover_segment),
        allWords,
      );

      const scenesWithTiming = sortedInsertedScenes.map((scene, index) => ({
        ...scene,
        start_time: realignedTimings[index].start_time,
        end_time: realignedTimings[index].end_time,
      }));

      await Promise.all(
        scenesWithTiming.map((scene) =>
          client.database
            .from("video_agent_scenes")
            .update({ start_time: scene.start_time, end_time: scene.end_time })
            .eq("id", scene.id),
        ),
      );

      // Content-based avatar placement: the scene-planner LLM already
      // flagged which scenes open a genuinely new point vs. continue the
      // previous one (starts_new_point). The avatar appears at exactly
      // those scenes -- no duration-based math, no forced placement on
      // any particular scene (including the last one).
      const avatarSceneIds = new Set<string>(
        scenesWithTiming.filter((scene) => scene.starts_new_point).map((scene) => scene.id),
      );

      if (avatarSceneIds.size > 0) {
        await client.database
          .from("video_agent_scenes")
          .update({ has_avatar_clip: true })
          .in("id", Array.from(avatarSceneIds));
      }

      metadata.set("progress", { step: STEPS.generatingBRoll, percentage: 65 });
      const batchItems = scenesWithTiming.map((scene) => {
        const hasAvatarClip = avatarSceneIds.has(scene.id);
        const sceneSeconds = scene.end_time - scene.start_time;
        const needsBRoll = scene.has_b_roll && (!hasAvatarClip || sceneSeconds > AVATAR_CLIP_SECONDS);

        return {
          payload: {
            sceneId: scene.id,
            projectId: payload.projectId,
            bRollStyle: payload.bRollStyle,
            visualPrompt: scene.visual_prompt ?? scene.voiceover_segment,
            aspectRatio: payload.aspectRatio,
            sceneDurationSeconds: sceneSeconds,
            needsBRoll,
            hasAvatarClip,
            avatarClipSeconds: AVATAR_CLIP_SECONDS,
            avatarImageUrl: hasAvatarClip ? payload.avatarImageUrl : undefined,
            narrationAudioUrl: hasAvatarClip ? narrationUpload.url : undefined,
            avatarClipStartSeconds: hasAvatarClip ? scene.start_time : undefined,
            avatarClipEndSeconds: hasAvatarClip ? Math.min(scene.start_time + AVATAR_CLIP_SECONDS, scene.end_time) : undefined,
          },
          // Scenes run strictly serialized (queue.concurrencyLimit: 1 on
          // generate-video-agent-scene), so a later scene can end up
          // waiting past Trigger.dev's local-dev-only 10-minute default
          // ttl before its turn even starts, getting killed as "Expired"
          // for a reason that has nothing to do with the scene itself.
          // ttl: 0 disables that dev-only safety net.
          options: { ttl: 0 },
        };
      });

      // Lets the frontend show a real "X of Y scenes done" percentage and a
      // growing preview instead of the pipeline-step percentage sitting
      // pinned at 65% for this whole (often multi-minute) fan-out -- see
      // generate-video-agent-scene.ts's best-effort incremental update.
      await client.database
        .from("video_agent_projects")
        .update({ scenes_total: batchItems.length, scenes_completed: 0 })
        .eq("id", payload.projectId);

      const batchResult = await tasks.batchTriggerAndWait("generate-video-agent-scene", batchItems);
      const failedRuns = batchResult.runs.filter((run) => !run.ok);

      if (failedRuns.length > 0) {
        throw new Error(`${failedRuns.length} of ${batchResult.runs.length} scenes failed to generate`);
      }

      metadata.set("progress", { step: STEPS.creatingComposition, percentage: 78 });
      const { data: finalScenes, error: finalScenesError } = await client.database
        .from("video_agent_scenes")
        .select(
          "id, scene_index, start_time, end_time, has_avatar_clip, avatar_clip_url, avatar_clip_duration_seconds, b_roll_type, b_roll_url, illustration_data",
        )
        .eq("project_id", payload.projectId)
        .order("scene_index", { ascending: true });

      if (finalScenesError || !finalScenes) {
        throw new Error(finalScenesError?.message || "Failed to load generated scenes");
      }

      const { data: projectRow, error: projectRowError } = await client.database
        .from("video_agent_projects")
        .select("aspect_ratio, duration_seconds, narration_audio_url, caption_style, captions_data, transition_style")
        .eq("id", payload.projectId)
        .single();

      if (projectRowError || !projectRow) {
        throw new Error(projectRowError?.message || "Failed to load project");
      }

      const compositionData = buildCompositionData(projectRow, finalScenes);

      metadata.set("progress", { step: STEPS.savingAssets, percentage: 85 });
      await client.database.from("video_agent_projects").update({ composition_data: compositionData }).eq("id", payload.projectId);

      // Prepare phase ends here -- the expensive server-side Remotion
      // render (renderVideoAgentComposition, in render-video-agent.ts) only
      // runs once the user explicitly confirms via renderVideoAgentAction,
      // after reviewing this composition_data live in the Player preview.
      await client.database.from("video_agent_projects").update({ status: "awaiting_render" }).eq("id", payload.projectId);
      metadata.set("progress", { step: STEPS.readyForPreview, percentage: 100 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      metadata.set("error", message);
      throw err;
    }
  },
  onFailure: async ({ payload: rawPayload, error }) => {
    const payload = payloadSchema.parse(rawPayload);
    const client = createInsforgeAdminClient();
    const message = error instanceof Error ? error.message : "Generation failed";

    await client.database.rpc("refund_credits", { p_user_id: payload.userId, p_amount: payload.creditsCharged });

    await client.database
      .from("video_agent_projects")
      .update({ status: "failed", error_message: message })
      .eq("id", payload.projectId);
  },
});
