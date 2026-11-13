const COVER_RATIO = 16 / 9;
const COVER_MAX_WIDTH = 1920;

export interface PreparedCover {
  bytes: Uint8Array;
  /** 用于预览的对象地址，用完需调用 URL.revokeObjectURL 释放。 */
  previewUrl: string;
  width: number;
  height: number;
}

/**
 * 把用户选择的图片处理成直播封面：居中裁成 16:9，宽度超过 1920 时等比缩小，输出 JPEG。
 */
export async function prepareCover(file: File): Promise<PreparedCover> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("无法读取这张图片，请换一张 JPG 或 PNG");
  });

  // 以原图为基准，取最大的居中 16:9 区域。
  let sw = bitmap.width;
  let sh = Math.round(sw / COVER_RATIO);
  if (sh > bitmap.height) {
    sh = bitmap.height;
    sw = Math.round(sh * COVER_RATIO);
  }
  const sx = Math.round((bitmap.width - sw) / 2);
  const sy = Math.round((bitmap.height - sh) / 2);

  const width = Math.min(sw, COVER_MAX_WIDTH);
  const height = Math.round(width / COVER_RATIO);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("图片处理失败");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  );
  if (!blob) throw new Error("图片处理失败");

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    previewUrl: URL.createObjectURL(blob),
    width,
    height,
  };
}
