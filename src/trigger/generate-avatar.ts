import { task, metadata } from "@trigger.dev/sdk";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";

import { createInsforgeAdminClient } from "@/lib/insforge/admin";

const AVATAR_STYLES = ["podcast", "casual", "3d_cartoon", "stylized"] as const;
const ASPECT_RATIOS = ["16:9", "9:16"] as const;

const payloadSchema = z.object({
  avatarId: z.string(),
  userId: z.string(),
  prompt: z.string().optional(),
  style: z.enum(AVATAR_STYLES),
  sourceImageUrl: z.string().optional(),
  ratios: z.array(z.enum(ASPECT_RATIOS)).min(1),
});

type AvatarPayload = z.infer<typeof payloadSchema>;

const STYLE_PROMPTS: Record<(typeof AVATAR_STYLES)[number], string> = {
  podcast: "professional podcast host headshot, studio lighting, microphone visible",
  casual: "casual friendly portrait, natural lighting, relaxed pose",
  "3d_cartoon": "3D cartoon character portrait, Pixar-style rendering",
  stylized: "stylized digital art portrait, bold colors, artistic illustration",
};

async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch source image: ${response.status}`);
  }

  const mimeType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());

  return { data: buffer.toString("base64"), mimeType };
}

async function generateOne(
  ai: GoogleGenAI,
  prompt: string,
  sourceImage: { data: string; mimeType: string } | null,
  aspectRatio: "16:9" | "9:16",
) {
  const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [{ text: prompt }];

  if (sourceImage) {
    parts.push({ inlineData: sourceImage });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-image",
    contents: parts,
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio },
    },
  });

  const base64 = response.data;

  if (!base64) {
    throw new Error("Gemini did not return image data");
  }

  return base64;
}

async function uploadGenerated(
  client: ReturnType<typeof createInsforgeAdminClient>,
  avatarId: string,
  suffix: "16-9" | "9-16",
  base64: string,
) {
  const buffer = Buffer.from(base64, "base64");
  const blob = new Blob([buffer], { type: "image/png" });
  const path = `generated/${avatarId}-${suffix}.png`;

  const { data, error } = await client.storage.from("avatars").upload(path, blob);

  if (error || !data) {
    throw new Error(error?.message || "Failed to upload generated image");
  }

  return { url: data.url, key: data.key };
}

export const generateAvatarTask = task({
  id: "generate-avatar",
  maxDuration: 300,
  run: async (rawPayload: AvatarPayload) => {
    const payload = payloadSchema.parse(rawPayload);
    const client = createInsforgeAdminClient();
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const fullPrompt = [STYLE_PROMPTS[payload.style], payload.prompt].filter(Boolean).join(". ");

    await client.database.from("avatars").update({ status: "processing" }).eq("id", payload.avatarId);

    try {
      const sourceImage = payload.sourceImageUrl ? await fetchAsBase64(payload.sourceImageUrl) : null;
      const total = payload.ratios.length;
      const updates: Record<string, string> = {};

      for (let i = 0; i < total; i++) {
        const ratio = payload.ratios[i];
        const stepPercentage = Math.round((i / total) * 80) + 10;
        metadata.set("progress", { step: ratio, percentage: stepPercentage });

        const base64 = await generateOne(ai, fullPrompt, sourceImage, ratio);
        const suffix = ratio === "16:9" ? "16-9" : "9-16";
        const upload = await uploadGenerated(client, payload.avatarId, suffix, base64);

        if (ratio === "16:9") {
          updates.crop_16_9_url = upload.url;
          updates.crop_16_9_key = upload.key;
        } else {
          updates.crop_9_16_url = upload.url;
          updates.crop_9_16_key = upload.key;
        }
      }

      metadata.set("progress", { step: "uploading", percentage: 95 });

      await client.database
        .from("avatars")
        .update({ status: "completed", ...updates })
        .eq("id", payload.avatarId);

      metadata.set("progress", { step: "completed", percentage: 100 });
    } catch (err) {
      await client.database
        .from("avatars")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : "Generation failed",
        })
        .eq("id", payload.avatarId);

      throw err;
    }
  },
});
