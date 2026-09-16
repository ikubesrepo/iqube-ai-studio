import "server-only";

import { GoogleGenAI } from "@google/genai";

import { isIllustrationCodeSafe } from "@/remotion/dynamic-illustration";

const CODE_FENCE_PATTERN = /```(?:tsx|jsx|typescript|javascript|js|ts)?\n?([\s\S]*?)```/;

function stripCodeFence(text: string): string {
  const match = text.match(CODE_FENCE_PATTERN);
  return (match ? match[1] : text).trim();
}

function buildPrompt(visualPrompt: string, sceneDurationSeconds: number): string {
  return [
    "Write a single self-contained React component for a Remotion animated illustration/graphic scene.",
    "",
    "STRICT rules:",
    '- Name the component exactly `Scene` (a plain function: `function Scene() { ... }`).',
    "- Do NOT write any import, export, or require statements.",
    "- Do NOT reference React, useCurrentFrame, useVideoConfig, interpolate, spring, or AbsoluteFill via any import -- they are already available as global identifiers, just use them directly.",
    "- Do NOT use fetch, document, window, localStorage, or any browser/network API.",
    "- Use only inline styles (the `style` prop) -- no CSS classes, no styled-components, no external assets.",
    "- Animate using `useCurrentFrame()` and `useVideoConfig()` (for fps) combined with `interpolate(...)` and/or `spring(...)` from Remotion.",
    "- Wrap the whole scene in a full-bleed `<AbsoluteFill>` with an explicit backgroundColor.",
    "- Keep it visually simple but purposeful: basic shapes (divs styled as rects/circles), text, and color/position/opacity animation. No external images or SVG files.",
    "- Return ONLY the code for the `Scene` function. No markdown fences, no explanation, no comments outside the code.",
    "",
    `The scene should visually depict: "${visualPrompt}"`,
    `The scene lasts approximately ${sceneDurationSeconds.toFixed(1)} seconds.`,
  ].join("\n");
}

/**
 * Generates real React/Remotion component source (not JSON shape data) for
 * one "AI Illustration" b-roll scene. The returned code is compiled and
 * rendered at render time by remotion/dynamic-illustration.ts, in both the
 * Player (live preview) and the server-side renderer.
 */
export async function generateIllustrationComponentCode(visualPrompt: string, sceneDurationSeconds: number): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("Gemini is not configured yet.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Ask twice at most: if the first attempt trips the safety check (stray
  // import, fetch, etc.), retry once with a sharper reminder before giving
  // up -- a single bad scene shouldn't require failing the whole video.
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt =
      attempt === 0
        ? buildPrompt(visualPrompt, sceneDurationSeconds)
        : `${buildPrompt(visualPrompt, sceneDurationSeconds)}\n\nYour previous attempt violated the strict rules above (likely an import, export, or forbidden API). Follow them exactly this time.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
    });

    const raw = response.text?.trim();
    if (!raw) continue;

    const code = stripCodeFence(raw);

    if (isIllustrationCodeSafe(code) && /function\s+Scene\s*\(/.test(code)) {
      return code;
    }
  }

  throw new Error("Could not generate a valid illustration scene.");
}
