import { zipSync, strToU8 } from 'fflate';
import type { DocumentSource } from '../types';

/** A `File`-alike over bytes we already hold, for extractors under test. */
export function sourceFromBytes(name: string, bytes: Uint8Array): DocumentSource {
  return {
    name,
    size: bytes.byteLength,
    async arrayBuffer() {
      // Copy into a standalone buffer so the source behaves like a real File.
      return bytes.slice().buffer;
    },
  };
}

export function sourceFromString(name: string, contents: string): DocumentSource {
  return sourceFromBytes(name, strToU8(contents));
}

/** Zips the given entries the way Word and PowerPoint do. */
function officeFile(name: string, entries: Record<string, string>): DocumentSource {
  const zipped = zipSync(
    Object.fromEntries(Object.entries(entries).map(([path, xml]) => [path, strToU8(xml)])),
  );
  return sourceFromBytes(name, zipped);
}

/** One `<w:p>` paragraph, split across runs the way Word actually writes it. */
function paragraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

export function docxFile(
  name: string,
  paragraphs: string[],
  options: { title?: string } = {},
): DocumentSource {
  const entries: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    'word/document.xml': `<?xml version="1.0"?><w:document><w:body>${paragraphs
      .map(paragraph)
      .join('')}</w:body></w:document>`,
  };
  if (options.title) {
    entries['docProps/core.xml'] =
      `<?xml version="1.0"?><cp:coreProperties><dc:title>${options.title}</dc:title></cp:coreProperties>`;
  }
  return officeFile(name, entries);
}

export interface SlideFixture {
  /** Text runs on the slide itself. */
  body: string[];
  /** Text runs in the speaker notes, if any. */
  notes?: string[];
  /** Pictures placed on the slide: media filename → size in bytes. */
  images?: Record<string, number>;
}

/** Zips binary parts alongside the XML ones, the way real media is stored. */
function officeFileWithMedia(
  name: string,
  xml: Record<string, string>,
  media: Record<string, Uint8Array>,
): DocumentSource {
  const entries: Record<string, Uint8Array> = Object.fromEntries(
    Object.entries(xml).map(([path, text]) => [path, strToU8(text)]),
  );
  for (const [path, bytes] of Object.entries(media)) entries[path] = bytes;
  return sourceFromBytes(name, zipSync(entries));
}

/** Distinguishable bytes, so dedupe treats two fixtures as different images. */
export function imageBytes(seed: string, size: number): Uint8Array {
  return new Uint8Array(size).fill(seed.charCodeAt(0) % 256);
}

export function pptxFile(name: string, slides: SlideFixture[]): DocumentSource {
  const xml: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
  };
  const media: Record<string, Uint8Array> = {};

  slides.forEach((slide, index) => {
    const number = index + 1;
    xml[`ppt/slides/slide${number}.xml`] =
      `<?xml version="1.0"?><p:sld><p:cSld><p:spTree>${slide.body
        .map((line) => `<a:p><a:r><a:t>${line}</a:t></a:r></a:p>`)
        .join('')}</p:spTree></p:cSld></p:sld>`;
    if (slide.notes) {
      xml[`ppt/notesSlides/notesSlide${number}.xml`] =
        `<?xml version="1.0"?><p:notes>${slide.notes
          .map((line) => `<a:p><a:r><a:t>${line}</a:t></a:r></a:p>`)
          .join('')}</p:notes>`;
    }
    if (slide.images) {
      const relationships = Object.keys(slide.images).map(
        (file, position) =>
          `<Relationship Id="rId${position + 1}" Target="../media/${file}"/>`,
      );
      xml[`ppt/slides/_rels/slide${number}.xml.rels`] =
        `<?xml version="1.0"?><Relationships>${relationships.join('')}</Relationships>`;
      for (const [file, size] of Object.entries(slide.images)) {
        media[`ppt/media/${file}`] = imageBytes(file, size);
      }
    }
  });

  return officeFileWithMedia(name, xml, media);
}
