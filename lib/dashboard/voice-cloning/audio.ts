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

/**
 * Concatenates multiple mp3 buffers (in order) into one mp3 buffer.
 * Re-encodes (rather than stream-copying) for the same reason as
 * lib/dashboard/video-avatars/video-concat.ts's concatVideoBuffers: the
 * inputs come from separate encodes/generations and aren't guaranteed to
 * share identical codec parameters. Used to stitch back together narration
 * that had to be synthesized in multiple chunks (see
 * lib/dashboard/video-avatars/narration.ts) because Resemble AI's
 * Chatterbox model silently truncates generation on long text inputs.
 */
export async function concatAudioBuffers(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length === 1) {
    return buffers[0];
  }

  const stamp = randomUUID();
  const inputPaths: string[] = [];
  const listPath = path.join(tmpdir(), `${stamp}-list.txt`);
  const outputPath = path.join(tmpdir(), `${stamp}-concat.mp3`);

  try {
    for (let i = 0; i < buffers.length; i++) {
      const partPath = path.join(tmpdir(), `${stamp}-part-${i}.mp3`);
      await writeFile(partPath, buffers[i]);
      inputPaths.push(partPath);
    }

    const listContent = inputPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
    await writeFile(listPath, listContent);

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .audioCodec("libmp3lame")
        .format("mp3")
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(outputPath);
    });

    return await readFile(outputPath);
  } finally {
    await Promise.all(inputPaths.map((p) => unlink(p).catch(() => {})));
    await unlink(listPath).catch(() => {});
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
// A trailing chunk shorter than this gets merged into the previous chunk
// instead of being sent on its own. mp3 -ss/-t seeking (extractAudioSlice,
// this function's own re-encode) isn't frame-exact, so a slice requested as
// "3.000s" can measure out to e.g. 3.048s -- naively chunking that at a 3s
// boundary produces a real ~3s chunk plus a ~48ms second chunk, which
// DomoAI's talking-avatar API rejects with {"error_code":"1002","message":
// "Audio processing failed"} (confirmed via a live 400 response against a
// 237-byte, 0.048s chunk). Merging avoids ever producing a chunk this
// degenerate; the previous chunk simply runs a little over `chunkSeconds`,
// which callers already treat as a soft cap (see DOMOAI_MAX_CLIP_SECONDS's
// own Math.round/clamp when declaring the "seconds" field to DomoAI).
const MIN_TRAILING_CHUNK_SECONDS = 0.5;

export async function splitAudioIntoChunks(buffer: Buffer, chunkSeconds: number): Promise<{ buffer: Buffer; durationSeconds: number }[]> {
  const totalSeconds = await getAudioDurationSeconds(buffer);

  // Already short enough -- return the buffer as-is instead of round-tripping
  // it through an unnecessary ffmpeg cut+re-encode. This matters for callers
  // that hand in an already-sliced clip (e.g. generate-video-agent-scene.ts's
  // generateAvatarClip, which first slices a scene's ~3s window out of the
  // master narration via extractAudioSlice before this function ever sees
  // it): re-encoding an already-tiny mp3 a second time was pure overhead.
  if (totalSeconds <= chunkSeconds) {
    return [{ buffer, durationSeconds: totalSeconds }];
  }

  let chunkCount = Math.max(1, Math.ceil(totalSeconds / chunkSeconds));
  const trailingSeconds = totalSeconds - (chunkCount - 1) * chunkSeconds;
  if (chunkCount > 1 && trailingSeconds < MIN_TRAILING_CHUNK_SECONDS) {
    chunkCount -= 1;
  }

  const stamp = randomUUID();
  const inputPath = path.join(tmpdir(), `${stamp}.input.mp3`);
  const outputPaths: string[] = [];

  await writeFile(inputPath, buffer);

  try {
    const chunks: { buffer: Buffer; durationSeconds: number }[] = [];

    for (let i = 0; i < chunkCount; i++) {
      const start = i * chunkSeconds;
      // The last chunk absorbs whatever remains (including any leftover
      // merged in above), which may run slightly over `chunkSeconds`.
      const duration = i === chunkCount - 1 ? totalSeconds - start : chunkSeconds;
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
