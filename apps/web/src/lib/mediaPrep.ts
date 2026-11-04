/**
 * Prepares images on the SENDER's device so receivers download little:
 * - big photos are re-encoded to ≤ 2560 px (WebP, JPEG fallback on Safari) — only if that really shrinks them,
 * - a ~640 px thumbnail for the chat (tens of KB),
 * - a 24 px blurred preview as a data URL (≈ 1 KB) that shows instantly.
 * GIFs (animation) and small files are sent untouched.
 */
export interface Prepared {
  file: File;
  thumb?: Blob;
  placeholder?: string;
}

const MAX_SIDE = 2560;
const THUMB_SIDE = 640;
const PREVIEW_SIDE = 24;

async function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  const webp = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', quality));
  if (webp && webp.type === 'image/webp') return webp;
  return new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality)); // Safari can't encode WebP
}

function draw(src: ImageBitmap, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * scale));
  c.height = Math.max(1, Math.round(src.height * scale));
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export async function prepareImage(file: File): Promise<Prepared> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || typeof createImageBitmap !== 'function') return { file };
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { file };
  }
  try {
    let out = file;
    if (file.size > 700 * 1024 || Math.max(bmp.width, bmp.height) > MAX_SIDE || /heic|heif/.test(file.type)) {
      const blob = await encode(draw(bmp, MAX_SIDE), 0.86);
      if (blob && blob.size < file.size) {
        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
        out = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.' + ext, { type: blob.type });
      }
    }
    const thumb = Math.max(bmp.width, bmp.height) > THUMB_SIDE * 1.2 || out.size > 200 * 1024 ? ((await encode(draw(bmp, THUMB_SIDE), 0.78)) ?? undefined) : undefined;
    const tiny = draw(bmp, PREVIEW_SIDE);
    const placeholder = tiny.toDataURL('image/jpeg', 0.6);
    return { file: out, thumb, placeholder: placeholder.length <= 4000 ? placeholder : undefined };
  } finally {
    bmp.close();
  }
}
