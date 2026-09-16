import "server-only";

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import type { BRollStyle } from "./pricing";

const VISUAL_PROMPT_INSTRUCTIONS: Record<BRollStyle, string> = {
  ai_image:
    "a single, vivid, detailed AI image-generation prompt describing exactly what the still image should show " +
    "(subject, setting, mood, lighting) -- no camera-motion or video-specific language.",
  ai_video:
    "a short AI video-generation prompt describing the motion/action happening in the scene over a few seconds " +
    "(what moves, how the camera or subject behaves) -- write it as a single flowing sentence, not a list.",
  stock:
    "a concise 2-4 word stock-footage search keyword phrase (literal, concrete nouns -- the kind of short phrase " +
    "you'd type into a stock photo/video search box, not a full sentence).",
  ai_illustration:
    "a short concept description for a simple animated illustration/graphic (the key visual metaphor or elements " +
    "and how they should move), suitable for a minimal animated-infographic-style scene -- not a photorealistic prompt.",
};

const scenePlanSchema = z.object({
  scenes: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
        start_time: z.number(),
        end_time: z.number(),
        voiceover_segment: z.string(),
        caption_text: z.string(),
        b_roll_requirement: z.boolean(),
        visual_prompt_or_keyword: z.string(),
        starts_new_point: z.boolean(),
      }),
    )
    .min(1),
});

export type PlannedScene = z.infer<typeof scenePlanSchema>["scenes"][number];

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          start_time: { type: "number" },
          end_time: { type: "number" },
          voiceover_segment: { type: "string" },
          caption_text: { type: "string" },
          b_roll_requirement: { type: "boolean" },
          visual_prompt_or_keyword: { type: "string" },
          starts_new_point: { type: "boolean" },
        },
        required: [
          "title",
          "summary",
          "start_time",
          "end_time",
          "voiceover_segment",
          "caption_text",
          "b_roll_requirement",
          "visual_prompt_or_keyword",
          "starts_new_point",
        ],
      },
    },
  },
  required: ["scenes"],
};

/**
 * Analyzes the final script and splits it into scenes covering the full
 * target duration. Scene count/length is LLM-decided (not hardcoded) --
 * the prompt only instructs an approximate target so the breakdown reads
 * naturally against the actual script content.
 */
export async function planScenes(
  script: string,
  durationSeconds: number,
  bRollStyle: BRollStyle,
  refinementNotes?: string,
): Promise<PlannedScene[]> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini is not configured yet.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // start_time/end_time here are only an initial estimate to help the LLM
  // reason about pacing -- the real timing used in the final video is
  // re-derived from the actual synthesized voiceover afterward (see
  // lib/dashboard/video-agent/scene-timing.ts), since TTS speaking pace
  // doesn't perfectly match this estimate.
  const prompt = [
    "You are planning the scene breakdown for a short AI-narrated video.",
    `The full script (to be spoken by the voiceover) is:\n"""\n${script}\n"""`,
    `The video's target duration is approximately ${durationSeconds} seconds -- use this only to judge pacing; ` +
      "the exact timing will be corrected later against the real generated voiceover.",
    "Split the script into consecutive, non-overlapping scenes that together cover the entire script from start to end.",
    "Aim for scenes roughly 5-10 seconds long, but prioritize natural breaks in the script over a fixed count.",
    "For each scene provide: a short title, a one-sentence summary, an estimated start_time and end_time in seconds, " +
      "the exact voiceover_segment (a contiguous substring of the script this scene covers, word-for-word -- this is " +
      "critical, it must be an exact slice of the script text with no changes), the on-screen caption_text (can match " +
      "the voiceover segment or be a shortened version), whether b_roll_requirement is true (almost always true " +
      "unless the scene is purely an avatar-led moment), and a visual_prompt_or_keyword tailored to this exact format: " +
      VISUAL_PROMPT_INSTRUCTIONS[bRollStyle],
    "Also decide, for each scene, whether it starts_new_point: true if this scene begins explaining a genuinely new " +
      "idea, topic, step, or point that hasn't been covered yet, or false if it is a continuation/elaboration of the " +
      "same point the previous scene was making. The first scene should normally be true (it opens the video). If " +
      "the script has a distinct closing/summary/call-to-action that introduces a new closing thought, mark that " +
      "scene true as well -- but if the ending is simply a natural continuation of the last point already covered, " +
      "mark it false. Most scripts naturally break into a handful of distinct points; a scene that just adds detail " +
      "or a second sentence about the same idea should be false.",
    ...(refinementNotes?.trim()
      ? [
          "The user has requested the following refinement to this regeneration -- apply it while re-planning " +
            `scenes: "${refinementNotes.trim()}"`,
        ]
      : []),
  ].join("\n\n");

  const response = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_JSON_SCHEMA,
    },
  });

  const raw = response.text;

  if (!raw) {
    throw new Error("Gemini did not return a scene breakdown.");
  }

  const parsed = scenePlanSchema.parse(JSON.parse(raw));
  return parsed.scenes;
}
