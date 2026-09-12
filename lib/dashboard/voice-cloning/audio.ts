import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { readFile, unlink, writeFile } from "fs/promises";

import ffmpegStaticPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";

// `ffmpeg-static` computes its binary path from its own module's __dirname
// at import time. Trigger.dev's dev-mode bundler copies task code into a
// temp build folder (.trigger/tmp/build-*), which rewrites __dirname to
// that temp folder -- so the package's own path points at a location where
// the binary was never actually copied, throwing ENOENT. Resolve the real
// on-disk location relative to the project root instead (Trigger.dev's
// deployed `ffmpeg()` build extension sets FFMPEG_PATH itself, so prefer
// that when present).
function resolveFfmpegPath(): string | null {
  if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }

  const exeName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const projectRelativePath = path.join(process.cwd(), "node_modules", "ffmpeg-static", exeName);

  if (existsSync(projectRelativePath)) {
    return projectRelativePath;
  }

  if (ffmpegStaticPath && existsSync(ffmpegStaticPath)) {
    return ffmpegStaticPath;
  }

  return null;
}

const resolvedFfmpegPath = resolveFfmpegPath();

if (resolvedFfmpegPath) {
  ffmpeg.setFfmpegPath(resolvedFfmpegPath);
}

export async function convertWavBufferToMp3(wavBuffer: Buffer): Promise<Buffer> {
  const stamp = randomUUID();
  const inputPath = path.join(tmpdir(), `${stamp}.wav`);
  const outputPath = path.join(tmpdir(), `${stamp}.mp3`);

  await writeFile(inputPath, wavBuffer);

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec("libmp3lame")
        .audioBitrate("128k")
        .format("mp3")
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(outputPath);
    });

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Converts an audio buffer of any ffmpeg-readable format (m4a, mp3, wav, ...)
 * to WAV. Chatterbox's `audio_prompt` input requires WAV specifically --
 * everything we store (uploaded samples, cloned voices, Deepgram previews)
 * may be a different format, so this runs right before every Replicate call.
 */
export async function convertBufferToWav(inputBuffer: Buffer): Promise<Buffer> {
  const stamp = randomUUID();
  const inputPath = path.join(tmpdir(), `${stamp}.input`);
  const outputPath = path.join(tmpdir(), `${stamp}.wav`);

  await writeFile(inputPath, inputBuffer);

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec("pcm_s16le")
        .format("wav")
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(outputPath);
    });

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

export async function fetchUrlToBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}
