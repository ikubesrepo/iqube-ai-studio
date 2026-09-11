async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Failed to encode image"));
      }
    }, "image/png");
  });
}

function drawCrop(bitmap: ImageBitmap, aspectRatio: number): Promise<Blob> {
  const sourceRatio = bitmap.width / bitmap.height;
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;

  if (sourceRatio > aspectRatio) {
    sw = bitmap.height * aspectRatio;
    sx = (bitmap.width - sw) / 2;
  } else {
    sh = bitmap.width / aspectRatio;
    sy = (bitmap.height - sh) / 2;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas is not supported");
  }

  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  return canvasToBlob(canvas);
}

export async function cropImageToAspectRatios(file: File) {
  const bitmap = await createImageBitmap(file);

  const [crop16x9, crop9x16] = await Promise.all([drawCrop(bitmap, 16 / 9), drawCrop(bitmap, 9 / 16)]);

  return { original: file, crop16x9, crop9x16 };
}
