import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { readFile, unlink, writeFile } from "fs/promises";

import ffmpegStaticPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";

// Same ffmpeg-path resolution workaround as lib/dashboard/voice-cloning/audio.ts
// (Trigger.dev's dev-mode bundler rewrites __dirname so ffmpeg-static's own
// path resolution points at the wrong location).
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

export async function extractThumbnailFromVideoBuffer(videoBuffer: Buffer): Promise<Buffer> {
  const stamp = randomUUID();
  const inputPath = path.join(tmpdir(), `${stamp}.mp4`);
  const outputPath = path.join(tmpdir(), `${stamp}.jpg`);

  await writeFile(inputPath, videoBuffer);

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .screenshots({
          timestamps: ["1"],
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
        });
    });

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
