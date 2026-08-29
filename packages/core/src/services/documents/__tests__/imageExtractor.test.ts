import { describe, expect, it } from 'vitest';
import { ImageExtractor } from '../imageExtractor';
import { DocumentExtractionError } from '../types';
import type { DocumentSource } from '../types';

/** A file-like source over bytes, standing in for a browser `File`. */
function source(name: string, bytes = 40_000): DocumentSource {
  const data = new Uint8Array(bytes).fill(7);
  return {
    name,
    size: data.byteLength,
    arrayBuffer: async () => data.buffer as ArrayBuffer,
  };
}

describe('ImageExtractor', () => {
  it('reads a photo as a document whose material is the picture', async () => {
    const document = await new ImageExtractor().extract(source('notes.jpg'));

    expect(document.kind).toBe('image');
    expect(document.images).toHaveLength(1);
    expect(document.images?.[0]?.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('is not synthetic, so a live model reads it rather than refusing it', async () => {
    const document = await new ImageExtractor().extract(source('diagram.png'));

    // There is no text in a photograph, but there is something real to read —
    // which is the distinction `synthetic` draws.
    expect(document.synthetic).toBeUndefined();
    expect(document.text).toBe('');
  });

  it('names the media type from the extension, so the model decodes it', async () => {
    const png = await new ImageExtractor().extract(source('diagram.PNG'));
    const webp = await new ImageExtractor().extract(source('board.webp'));

    expect(png.images?.[0]?.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(webp.images?.[0]?.dataUrl).toMatch(/^data:image\/webp;base64,/);
  });

  it('counts as a single page, so the plan page limit reads it sensibly', async () => {
    const document = await new ImageExtractor().extract(source('notes.jpeg'));

    expect(document.pageCount).toBe(1);
    expect(document.pages).toHaveLength(1);
  });

  it('refuses a picture too large to send, rather than failing at the model', async () => {
    await expect(new ImageExtractor().extract(source('huge.jpg', 5_000_000))).rejects.toBeInstanceOf(
      DocumentExtractionError,
    );
  });

  it('refuses a file that is not an image at all', async () => {
    await expect(new ImageExtractor().extract(source('notes.pdf'))).rejects.toBeInstanceOf(
      DocumentExtractionError,
    );
  });
});
