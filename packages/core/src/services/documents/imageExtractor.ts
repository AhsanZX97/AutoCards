import type { ExtractedDocument } from '../../types';
import { downscaleImages } from './downscaleImage';
import { MAX_IMAGE_PAYLOAD_BYTES, toBase64 } from './selectImages';
import {
  DocumentExtractionError,
  extensionOf,
  formatFileSize,
  type DocumentExtractor,
  type DocumentSource,
} from './types';

/**
 * Extension -> media type, for the encodings a vision model actually decodes.
 *
 * Deliberately short. TIFF, BMP and the raw camera formats are readable by
 * plenty of software but not by the models, so accepting them here would only
 * move the failure to a place where it costs an upload to discover.
 */
const MEDIA_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function imageMediaTypeOf(filename: string): string | undefined {
  return MEDIA_TYPE_BY_EXTENSION[extensionOf(filename)];
}

/**
 * A photograph, screenshot or scan, read as the document itself.
 *
 * Every other extractor pulls text out of a file and treats any pictures in it
 * as extra. Here the picture is the whole material: a snapshot of a whiteboard
 * or a page of handwritten notes has no text layer to recover, so the file is
 * wrapped as a one-page document carrying a single image and no text at all.
 *
 * That is not the same as an unreadable upload, so it is not flagged
 * {@link ExtractedDocument.synthetic} — the same call `OfficeExtractor` makes
 * for a slide deck that is all diagrams. What makes it readable is that the
 * run moves onto a model that can see, which `generateDeck` does whenever
 * pictures are going up.
 */
export class ImageExtractor implements DocumentExtractor {
  readonly id = 'image';

  async extract(source: DocumentSource): Promise<ExtractedDocument> {
    const mediaType = imageMediaTypeOf(source.name);
    if (!mediaType) {
      throw new DocumentExtractionError(
        `${source.name} is not an image format we can read. Upload a JPEG, PNG, WebP or GIF.`,
      );
    }

    const bytes = new Uint8Array(await source.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new DocumentExtractionError(`${source.name} is empty.`);
    }

    // Shrunk before it is measured, not after: a phone photo is several
    // megabytes at full resolution and a fraction of that at the size a model
    // reads it, so measuring first would turn away pictures that send fine.
    const [image] = await downscaleImages([
      { dataUrl: `data:${mediaType};base64,${toBase64(bytes)}`, bytes: bytes.byteLength },
    ]);
    if (!image) throw new DocumentExtractionError(`${source.name} could not be read.`);

    if (image.bytes > MAX_IMAGE_PAYLOAD_BYTES) {
      throw new DocumentExtractionError(
        `${source.name} is ${formatFileSize(image.bytes)}, which is more than one picture can send. ` +
          `Save it at a smaller size, or screenshot the part that matters.`,
      );
    }

    return {
      filename: source.name,
      size: source.size,
      kind: 'image',
      // One picture, one page. It keeps the plan's page limit meaningful for
      // someone uploading several photographed pages at once.
      pageCount: 1,
      pages: [''],
      text: '',
      images: [image],
    };
  }
}
