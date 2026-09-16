import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { readFile, unlink, writeFile } from "fs/promises";

import ffmpegStaticPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import ffmpeg from "fluent-ffmpeg";

// `ffmpeg-static`/`ffprobe-static` compute their binary paths from their
// own module's __dirname at import time. Trigger.dev's dev-mode bundler
// copies task code into a temp build folder (.trigger/tmp/build-*), which
// rewrites __dirname to that temp folder -- so the package's own path
// points at a location where the binary was never actually copied,
// throwing ENOENT. Resolve the real on-disk location relative to the
// project root instead (Trigger.dev's deployed `ffmpeg()` build extension
// sets FFMPEG_PATH itself, so prefer that when present).
function resolveBinaryPath(relativePathSegments: string[], fallbackPath: string | null, envVar: string): string | null {
  if (process.env[envVar] && existsSync(process.env[envVar]!)) {
    return process.env[envVar]!;
  }

  const projectRelativePath = path.join(process.cwd(), "node_modules", ...relativePathSegments);

  if (existsSync(projectRelativePath)) {
    return projectRelativePath;
  }

  if (fallbackPath && existsSync(fallbackPath)) {
    return fallbackPath;
  }

  return null;
}

// ffmpeg-static: flat layout (node_modules/ffmpeg-static/ffmpeg[.exe]).
const resolvedFfmpegPath = resolveBinaryPath(
  ["ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"],
  ffmpegStaticPath,
  "FFMPEG_PATH",
);

// ffprobe-static: nested layout (node_modules/ffprobe-static/bin/<platform>/<arch>/ffprobe[.exe]).
const resolvedFfprobePath = resolveBinaryPath(
  ["ffprobe-static", "bin", process.platform, process.arch, process.platform === "win32" ? "ffprobe.exe" : "ffprobe"],
  ffprobeStatic.path,
  "FFPROBE_PATH",
);

if (resolvedFfmpegPath) {
  ffmpeg.setFfmpegPath(resolvedFfmpegPath);
}

if (resolvedFfprobePath) {
  ffmpeg.setFfprobePath(resolvedFfprobePath);
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

/**
 * Extracts an exact [startSeconds, endSeconds) slice from a narration audio
 * buffer as a standalone mp3. Used to drive avatar-clip lip-sync with a
 * literal piece of the single master narration track (rather than a
 * separately re-synthesized TTS render of similar text), so the avatar's
 * lips match audio that is identical to what plays continuously in the
 * final composition -- eliminating double/drifting narration.
 */
export async function extractAudioSlice(buffer: Buffer, startSeconds: number, endSeconds: number): Promise<Buffer> {
  const stamp = randomUUID();
  const inputPath = path.join(tmpdir(), `${stamp}.input`);
  const outputPath = path.join(tmpdir(), `${stamp}.mp3`);
  const duration = Math.max(0.1, endSeconds - startSeconds);

  await writeFile(inputPath, buffer);

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(Math.max(0, startSeconds))
        .setDuration(duration)
        .audioCodec("libmp3lame")
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

export async function fetchUrlToBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function getAudioDurationSeconds(buffer: Buffer): Promise<number> {
  const stamp = randomUUID();
  const inputPath = path.join(tmpdir(), `${stamp}.input`);

  await writeFile(inputPath, buffer);

  try {
    return await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, data) => {
        if (err) return reject(err);
        resolve(data.format.duration ?? 0);
      });
    });
  } finally {
    await unlink(inputPath).catch(() => {});
  }
}

/**
 * Splits an audio buffer into consecutive chunks of at most `chunkSeconds`
 * each (the last chunk may be shorter). Used to work around DomoAI's
 * talking-avatar API only accepting up to ~3s of audio per request -- the
 * caller generates one avatar clip per chunk and stitches them back
 * together (see lib/dashboard/video-avatars/video-concat.ts).
 */
export async function splitAudioIntoChunks(buffer: Buffer, chunkSeconds: number): Promise<{ buffer: Buffer; durationSeconds: number }[]> {
  const totalSeconds = await getAudioDurationSeconds(buffer);
  const chunkCount = Math.max(1, Math.ceil(totalSeconds / chunkSeconds));
  const stamp = randomUUID();
  const inputPath = path.join(tmpdir(), `${stamp}.input.mp3`);
  const outputPaths: string[] = [];

  await writeFile(inputPath, buffer);

  try {
    const chunks: { buffer: Buffer; durationSeconds: number }[] = [];

    for (let i = 0; i < chunkCount; i++) {
      const start = i * chunkSeconds;
      const duration = Math.min(chunkSeconds, totalSeconds - start);
      if (duration <= 0) break;

      const outputPath = path.join(tmpdir(), `${stamp}-chunk-${i}.mp3`);
      outputPaths.push(outputPath);

      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .setStartTime(start)
          .setDuration(duration)
          .audioCodec("libmp3lame")
          .format("mp3")
          .on("end", () => resolve())
          .on("error", (err) => reject(err))
          .save(outputPath);
      });

      chunks.push({ buffer: await readFile(outputPath), durationSeconds: duration });
    }

    return chunks;
  } finally {
    await unlink(inputPath).catch(() => {});
    await Promise.all(outputPaths.map((p) => unlink(p).catch(() => {})));
  }
}
