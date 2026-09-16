import "server-only";

import { randomUUID } from "crypto";
import { tmpdir } from "os";
import path from "path";
import { readFile, unlink } from "fs/promises";

import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";

import type { VideoAgentCompositionProps } from "@/remotion/types";

const COMPOSITION_ID = "VideoAgentComposition";

/**
 * In production, trigger.config.ts's playwright() build extension installs
 * Chromium at BUILD time into the deployed image and sets
 * PLAYWRIGHT_BROWSERS_PATH -- resolving the executable from there avoids a
 * runtime download on every task run. That extension has no effect on a
 * local dev machine (apt-get doesn't run outside the Linux build container),
 * so local dev falls back to Remotion's own ensureBrowser(), which downloads
 * a portable Chrome-for-Testing binary appropriate for the host OS.
 */
async function resolveBrowserExecutable(): Promise<string | undefined> {
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
    return undefined;
  }

  try {
    const { chromium } = await import("playwright-core");
    return chromium.executablePath();
  } catch {
    return undefined;
  }
}

export async function renderVideoAgentComposition(compositionData: VideoAgentCompositionProps): Promise<Buffer> {
  const browserExecutable = await resolveBrowserExecutable();

  if (!browserExecutable) {
    await ensureBrowser();
  }

  const serveUrl = await bundle({
    entryPoint: path.join(process.cwd(), "remotion", "index.ts"),
  });

  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps: compositionData,
    browserExecutable,
  });

  const outputLocation = path.join(tmpdir(), `${randomUUID()}.mp4`);

  try {
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation,
      inputProps: compositionData,
      browserExecutable,
    });

    return await readFile(outputLocation);
  } finally {
    await unlink(outputLocation).catch(() => {});
  }
}
