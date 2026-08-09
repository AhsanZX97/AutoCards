import type { DocumentImage } from '../../types';

/**
 * Long edge, in pixels, of an image sent to a vision model.
 *
 * Well under what the models accept (Claude's high-resolution tier reads up to
 * 2576px). The cap is about cost rather than capability: image tokens scale
 * with area, and a full-resolution slide photo costs roughly three times what
 * this does while adding nothing for reading a diagram's labels.
 */
const MAX_LONG_EDGE = 1400;

/** JPEG quality for the re-encode. High enough to keep small type readable. */
const QUALITY = 0.82;

/**
 * Shrinks oversized pictures before they go to the model.
 *
 * Browser-only, and deliberately best-effort: outside a browser — and in any
 * browser without `OffscreenCanvas` — the original image is returned
 * unchanged. It is a cost optimisation, so failing to apply it must never fail
 * the upload.
 */
export async function downscaleImages(images: DocumentImage[]): Promise<DocumentImage[]> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') {
    return images;
  }
  return Promise.all(images.map(shrink));
}

async function shrink(image: DocumentImage): Promise<DocumentImage> {
  try {
    const source = await createImageBitmap(await (await fetch(image.dataUrl)).blob());
    try {
      const scale = MAX_LONG_EDGE / Math.max(source.width, source.height);
      if (scale >= 1) return image;

      const width = Math.round(source.width * scale);
      const height = Math.round(source.height * scale);
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) return image;
      context.drawImage(source, 0, 0, width, height);

      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
      const shrunk = await blobToDataUrl(blob);
      // A tiny source can re-encode larger than it started; keep the smaller.
      if (shrunk.length >= image.dataUrl.length) return image;

      return { ...image, dataUrl: shrunk, bytes: blob.size };
    } finally {
      source.close();
    }
  } catch {
    // Unsupported codec (WMF/EMF turn up in older Office files), a decode
    // failure, anything else — send what we already have.
    return image;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
