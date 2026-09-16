import "server-only";

import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { readFile, unlink, writeFile } from "fs/promises";

import ffmpegStaticPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";

// Same ffmpeg-path resolution workaround as lib/dashboard/voice-cloning/audio.ts.
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

async function trimToFile(inputPath: string, outputPath: string, startSeconds: number, durationSeconds: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(Math.max(0, startSeconds))
      .setDuration(Math.max(0.05, durationSeconds))
      .audioCodec("libmp3lame")
      .format("mp3")
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
}

/**
 * Replaces the [startSeconds, endSeconds) window of `masterBuffer` with
 * `replacementBuffer`, returning the spliced mp3 as one buffer. Used by
 * src/trigger/regenerate-video-agent-scene-avatar.ts to swap in a newly
 * synthesized (different-voice) narration segment for one scene's avatar
 * portion while leaving the rest of the master narration track (and
 * therefore caption timing, which is keyed off it) untouched.
 *
 * Re-encodes on concat (rather than stream-copying) for the same reason as
 * lib/dashboard/video-avatars/video-concat.ts's concatVideoBuffers: the
 * "before"/"replacement"/"after" segments come from different encodes and
 * aren't guaranteed to share identical codec parameters.
 */
export async function spliceAudioSegment(
  masterBuffer: Buffer,
  replacementBuffer: Buffer,
  startSeconds: number,
  endSeconds: number,
): Promise<Buffer> {
  const stamp = randomUUID();
  const masterPath = path.join(tmpdir(), `${stamp}-master.mp3`);
  const beforePath = path.join(tmpdir(), `${stamp}-before.mp3`);
  const replacementPath = path.join(tmpdir(), `${stamp}-replacement.mp3`);
  const afterPath = path.join(tmpdir(), `${stamp}-after.mp3`);
  const listPath = path.join(tmpdir(), `${stamp}-list.txt`);
  const outputPath = path.join(tmpdir(), `${stamp}-spliced.mp3`);

  const tempPaths = [masterPath, beforePath, replacementPath, afterPath, listPath, outputPath];

  try {
    await writeFile(masterPath, masterBuffer);
    await writeFile(replacementPath, replacementBuffer);

    const segmentPaths: string[] = [];

    if (startSeconds > 0.05) {
      await trimToFile(masterPath, beforePath, 0, startSeconds);
      segmentPaths.push(beforePath);
    }

    segmentPaths.push(replacementPath);

    // A generous duration cap (1 hour) works around ffmpeg needing an
    // explicit -t for the trailing segment; narration tracks here are
    // always far shorter than that.
    await trimToFile(masterPath, afterPath, endSeconds, 3600);
    segmentPaths.push(afterPath);

    const listContent = segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
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
    await Promise.all(tempPaths.map((p) => unlink(p).catch(() => {})));
  }
}
