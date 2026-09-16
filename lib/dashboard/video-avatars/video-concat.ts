import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { readFile, unlink, writeFile } from "fs/promises";

import ffmpegStaticPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";

// Same ffmpeg-path resolution workaround as lib/dashboard/voice-cloning/audio.ts
// and lib/dashboard/video-avatars/thumbnail.ts.
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

/**
 * Concatenates multiple video clip buffers (in order) into one MP4 buffer.
 * Re-encodes rather than stream-copying -- DomoAI's per-chunk clips are
 * separate generations and aren't guaranteed to share identical codec
 * parameters, so `-c copy` concat risks a corrupt or rejected output.
 */
export async function concatVideoBuffers(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length === 1) {
    return buffers[0];
  }

  const stamp = randomUUID();
  const inputPaths: string[] = [];
  const listPath = path.join(tmpdir(), `${stamp}-list.txt`);
  const outputPath = path.join(tmpdir(), `${stamp}-concat.mp4`);

  try {
    for (let i = 0; i < buffers.length; i++) {
      const partPath = path.join(tmpdir(), `${stamp}-part-${i}.mp4`);
      await writeFile(partPath, buffers[i]);
      inputPaths.push(partPath);
    }

    const listContent = inputPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
    await writeFile(listPath, listContent);

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(listPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .outputOptions(["-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p"])
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
