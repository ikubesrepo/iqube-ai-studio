import "server-only";

import { GoogleGenAI } from "@google/genai";
import Replicate from "replicate";
import { heartbeats } from "@trigger.dev/sdk";

import type { createInsforgeAdminClient } from "@/lib/insforge/admin";
import { fetchUrlToBuffer } from "@/lib/dashboard/voice-cloning/audio";
import { withReplicateRetry } from "@/lib/dashboard/voice-cloning/replicate";
import { searchPixabayImage, searchPixabayVideo } from "@/lib/dashboard/video-agent/pixabay";
import { generateIllustrationComponentCode } from "@/lib/dashboard/video-agent/illustration-codegen";

type AdminClient = ReturnType<typeof createInsforgeAdminClient>;

export type BRollAssetResult =
  | { type: "ai_image" | "ai_video" | "stock_image" | "stock_video"; url: string; key: string }
  | { type: "ai_illustration"; code: string };

async function fetchReplicateOutputBuffer(output: unknown): Promise<Buffer> {
  if (output && typeof output === "object" && "url" in output && typeof (output as { url: () => URL | string }).url === "function") {
    const url = (output as { url: () => URL | string }).url();
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Failed to fetch Replicate output: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  if (typeof output === "string") {
    const response = await fetch(output);
    if (!response.ok) throw new Error(`Failed to fetch Replicate output: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  throw new Error("Unexpected Replicate output shape");
}

/**
 * The four B-roll generation providers shared between the full-video
 * pipeline's per-scene task (src/trigger/generate-video-agent-scene.ts) and
 * the edit screen's single-scene regeneration task
 * (src/trigger/regenerate-video-agent-scene-broll.ts) -- kept in one place
 * so both stay in lockstep on upload paths/content types.
 */
export async function generateAiImageBRoll(
  client: AdminClient,
  projectId: string,
  sceneId: string,
  visualPrompt: string,
  aspectRatio: "16:9" | "9:16",
): Promise<BRollAssetResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini is not configured yet.");

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-image",
    contents: [{ text: visualPrompt }],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio },
    },
  });

  const base64 = response.data;
  if (!base64) throw new Error("Gemini did not return image data");

  await heartbeats.yield();
  const buffer = Buffer.from(base64, "base64");
  await heartbeats.yield();

  const path = `b-roll/${projectId}/${sceneId}.png`;
  const { data: upload, error } = await client.storage
    .from("video-agent")
    .upload(path, new Blob([new Uint8Array(buffer)], { type: "image/png" }));

  if (error || !upload) throw new Error(error?.message || "Failed to upload AI image b-roll");

  return { type: "ai_image", url: upload.url, key: upload.key };
}

export async function generateStockBRoll(
  client: AdminClient,
  projectId: string,
  sceneId: string,
  visualPrompt: string,
): Promise<BRollAssetResult> {
  const video = await searchPixabayVideo(visualPrompt);

  if (video) {
    const buffer = await fetchUrlToBuffer(video.url);
    const path = `b-roll/${projectId}/${sceneId}.mp4`;
    const { data: upload, error } = await client.storage
      .from("video-agent")
      .upload(path, new Blob([new Uint8Array(buffer)], { type: "video/mp4" }));

    if (error || !upload) throw new Error(error?.message || "Failed to upload stock video");
    return { type: "stock_video", url: upload.url, key: upload.key };
  }

  const image = await searchPixabayImage(visualPrompt);
  if (!image) throw new Error("No stock media found for this scene");

  const buffer = await fetchUrlToBuffer(image.url);
  const path = `b-roll/${projectId}/${sceneId}.jpg`;
  const { data: upload, error } = await client.storage
    .from("video-agent")
    .upload(path, new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }));

  if (error || !upload) throw new Error(error?.message || "Failed to upload stock image");
  return { type: "stock_image", url: upload.url, key: upload.key };
}

export async function generateAiVideoBRoll(
  client: AdminClient,
  projectId: string,
  sceneId: string,
  visualPrompt: string,
): Promise<BRollAssetResult> {
  const replicate = new Replicate();
  const output = await withReplicateRetry(() =>
    replicate.run("wan-video/wan-2.2-t2v-fast", { input: { prompt: visualPrompt } }),
  );

  const buffer = await fetchReplicateOutputBuffer(output);
  const path = `b-roll/${projectId}/${sceneId}.mp4`;
  const { data: upload, error } = await client.storage
    .from("video-agent")
    .upload(path, new Blob([new Uint8Array(buffer)], { type: "video/mp4" }));

  if (error || !upload) throw new Error(error?.message || "Failed to upload AI video b-roll");
  return { type: "ai_video", url: upload.url, key: upload.key };
}

export async function generateAiIllustrationBRoll(
  visualPrompt: string,
  sceneDurationSeconds: number,
): Promise<{ type: "ai_illustration"; code: string }> {
  const code = await generateIllustrationComponentCode(visualPrompt, sceneDurationSeconds);
  return { type: "ai_illustration", code };
}

/**
 * Downloads and uploads a specific stock media URL the user already picked
 * from a search result (rather than auto-searching again) -- used by the
 * edit screen's "Search Stock Media" scene-edit option.
 */
export async function uploadPickedStockBRoll(
  client: AdminClient,
  projectId: string,
  sceneId: string,
  pick: { type: "stock_image" | "stock_video"; url: string },
): Promise<BRollAssetResult> {
  const buffer = await fetchUrlToBuffer(pick.url);
  const isVideo = pick.type === "stock_video";
  const path = `b-roll/${projectId}/${sceneId}.${isVideo ? "mp4" : "jpg"}`;
  const { data: upload, error } = await client.storage
    .from("video-agent")
    .upload(path, new Blob([new Uint8Array(buffer)], { type: isVideo ? "video/mp4" : "image/jpeg" }));

  if (error || !upload) throw new Error(error?.message || "Failed to upload picked stock media");
  return { type: pick.type, url: upload.url, key: upload.key };
}
