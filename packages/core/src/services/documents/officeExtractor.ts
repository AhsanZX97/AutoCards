import type { DocumentImage, ExtractedDocument } from '../../types';
import { downscaleImages } from './downscaleImage';
import { selectImages, type CandidateImage } from './selectImages';
import { DocumentExtractionError, documentKindOf, type DocumentExtractor, type DocumentSource } from './types';

/**
 * Word and PowerPoint, read straight out of their zip containers.
 *
 * Both formats are a zip of XML parts, so one unzip and a little tag-scraping
 * covers them. The scraping is regex rather than a DOM parse on purpose: these
 * files are machine-written and well-formed, the same code runs in a test
 * environment with no `DOMParser`, and the only thing wanted out of them is the
 * text between known tags.
 *
 * `fflate` is imported on demand so a bundle only pays for the unzip when
 * someone actually uploads one of these.
 */
export class OfficeExtractor implements DocumentExtractor {
  readonly id = 'office';

  async extract(source: DocumentSource): Promise<ExtractedDocument> {
    const files = await unzip(source);
    const kind = documentKindOf(source.name);
    const title = readTitle(files);

    const extracted =
      kind === 'slides' ? readSlides(files, source.name) : readWordDocument(files, source.name);
    const images = await readImages(files, kind === 'slides');

    return {
      filename: source.name,
      size: source.size,
      kind: kind === 'slides' ? 'slides' : 'document',
      ...(extracted.pageCount === undefined ? {} : { pageCount: extracted.pageCount }),
      pages: extracted.pages,
      text: extracted.text,
      ...(images.length > 0 ? { images } : {}),
      ...(title ? { title } : {}),
      // A deck of pictures with no text is not a placeholder the way a scanned
      // PDF is — there is something real to read, just not as words.
      ...(extracted.text.trim() || images.length > 0 ? {} : { synthetic: true }),
    };
  }
}

type ZipEntries = Record<string, Uint8Array>;

async function unzip(source: DocumentSource): Promise<ZipEntries> {
  const buffer = await source.arrayBuffer();
  try {
    const { unzipSync } = await import('fflate');
    return unzipSync(new Uint8Array(buffer));
  } catch {
    // Either it is not a zip at all — a renamed .doc is the usual culprit — or
    // the file truncated on the way in. Neither is worth distinguishing here.
    throw new DocumentExtractionError(
      `Could not open ${source.name}. It may be damaged, or saved in an older format that only looks like a .docx or .pptx.`,
    );
  }
}

interface ExtractedParts {
  pages: string[];
  text: string;
  pageCount?: number;
}

/** `word/document.xml` holds the body; each `<w:p>` is a paragraph. */
function readWordDocument(files: ZipEntries, filename: string): ExtractedParts {
  const xml = decodeEntry(files, 'word/document.xml');
  if (xml === undefined) {
    throw new DocumentExtractionError(
      `${filename} does not look like a Word document. The main document part is missing.`,
    );
  }

  // No page count: a Word file does not contain one. Pagination is worked out
  // by whatever renders it, from the fonts and the paper size.
  const text = paragraphsOf(xml, 'w:p', 'w:t').join('\n');
  return { pages: [text], text };
}

/** One `ppt/slides/slideN.xml` per slide, with notes in a parallel part. */
function readSlides(files: ZipEntries, filename: string): ExtractedParts {
  const slides = numericallyOrdered(files, /^ppt\/slides\/slide(\d+)\.xml$/);
  if (slides.length === 0) {
    throw new DocumentExtractionError(`${filename} does not look like a PowerPoint deck. It has no slides in it.`);
  }

  const pages = slides.map(({ path, number }) => {
    const body = paragraphsOf(decodeEntry(files, path) ?? '', 'a:p', 'a:t').join('\n');
    // Speaker notes are where the explanation usually lives — a PDF export of
    // the same deck throws them away, which is the reason to prefer the
    // original file over one.
    const notesXml = decodeEntry(files, `ppt/notesSlides/notesSlide${number}.xml`);
    const notes = notesXml ? paragraphsOf(notesXml, 'a:p', 'a:t').join('\n') : '';
    return notes.trim() ? `${body}\n\nNotes: ${notes}` : body;
  });

  return { pages, text: pages.join('\n\n'), pageCount: pages.length };
}

/** Media types keyed by the extensions Office actually writes into `media/`. */
const IMAGE_MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/**
 * The pictures placed on the slides, or embedded in the Word body.
 *
 * For slides this walks each slide's relationship part rather than listing
 * `ppt/media/` wholesale, for two reasons: it says which slide a picture
 * belongs to, and it excludes the template's own furniture — master, layout
 * and theme images are referenced from those parts, not from a slide, and are
 * decoration by definition.
 */
async function readImages(files: ZipEntries, isSlides: boolean): Promise<DocumentImage[]> {
  const candidates: CandidateImage[] = isSlides ? slideImages(files) : bodyImages(files);
  if (candidates.length === 0) return [];
  return downscaleImages(selectImages(candidates));
}

function slideImages(files: ZipEntries): CandidateImage[] {
  const candidates: CandidateImage[] = [];
  for (const { path, number } of numericallyOrdered(files, /^ppt\/slides\/slide(\d+)\.xml$/)) {
    const rels = decodeEntry(files, path.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels'));
    if (!rels) continue;
    for (const match of rels.matchAll(/Target="([^"]*media\/[^"]+)"/g)) {
      const candidate = mediaCandidate(files, resolveMediaPath(match[1] ?? '', 'ppt'), number);
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates;
}

function bodyImages(files: ZipEntries): CandidateImage[] {
  const rels = decodeEntry(files, 'word/_rels/document.xml.rels');
  if (!rels) return [];

  const candidates: CandidateImage[] = [];
  for (const match of rels.matchAll(/Target="([^"]*media\/[^"]+)"/g)) {
    // No page number: a Word file has no pages to attribute them to.
    const candidate = mediaCandidate(files, resolveMediaPath(match[1] ?? '', 'word'));
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

/** `../media/image1.png` from a slide's rels resolves to `ppt/media/image1.png`. */
function resolveMediaPath(target: string, root: string): string {
  const file = target.split('/').pop() ?? '';
  return `${root}/media/${file}`;
}

function mediaCandidate(files: ZipEntries, path: string, page?: number): CandidateImage | undefined {
  const bytes = files[path];
  if (!bytes) return undefined;
  const mediaType = IMAGE_MEDIA_TYPES[path.split('.').pop()?.toLowerCase() ?? ''];
  // WMF, EMF and SVG turn up in Office files and no vision model reads them.
  if (!mediaType) return undefined;
  return { bytes, mediaType, ...(page === undefined ? {} : { page }) };
}

/** `docProps/core.xml` carries the title the author typed into file properties. */
function readTitle(files: ZipEntries): string | undefined {
  const xml = decodeEntry(files, 'docProps/core.xml');
  if (!xml) return undefined;
  const raw = /<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/.exec(xml)?.[1];
  const title = raw ? decodeEntities(raw).trim() : '';
  return title || undefined;
}

/**
 * The text of each paragraph, in order, with empty ones dropped.
 *
 * Word and PowerPoint both split a single sentence across several runs
 * whenever formatting changes mid-way, so runs within a paragraph are joined
 * with nothing between them and only the paragraph breaks become line breaks.
 */
function paragraphsOf(xml: string, paragraphTag: string, textTag: string): string[] {
  const paragraphs = xml.split(new RegExp(`</${paragraphTag}>`));
  const runPattern = new RegExp(`<${textTag}\\b[^>]*>([\\s\\S]*?)</${textTag}>`, 'g');

  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    let line = '';
    for (const match of paragraph.matchAll(runPattern)) {
      line += decodeEntities(match[1] ?? '');
    }
    const cleaned = line.trim();
    // Slides routinely carry their title twice — a title placeholder with a
    // heading textbox laid over it — and the model reads the repeat as
    // emphasis. Only immediate repeats are dropped: a two-column slide with
    // "Examples:" over each column has something between them, and both stay.
    if (cleaned && cleaned !== lines[lines.length - 1]) lines.push(cleaned);
  }
  return lines;
}

/** Zip entries matching `pattern`, ordered by the number in their name. */
function numericallyOrdered(
  files: ZipEntries,
  pattern: RegExp,
): Array<{ path: string; number: number }> {
  return Object.keys(files)
    .map((path) => {
      const match = pattern.exec(path);
      return match ? { path, number: Number(match[1]) } : undefined;
    })
    .filter((entry): entry is { path: string; number: number } => entry !== undefined)
    // Zip entries come back in whatever order they were stored, and sorting the
    // names as strings puts slide10 before slide2.
    .sort((a, b) => a.number - b.number);
}

function decodeEntry(files: ZipEntries, path: string): string | undefined {
  const bytes = files[path];
  return bytes ? new TextDecoder('utf-8').decode(bytes) : undefined;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return codePoint(Number.parseInt(entity.slice(2), 16), whole);
    }
    if (entity.startsWith('#')) {
      return codePoint(Number.parseInt(entity.slice(1), 10), whole);
    }
    return NAMED_ENTITIES[entity] ?? whole;
  });
}

function codePoint(value: number, fallback: string): string {
  return Number.isFinite(value) && value > 0 ? String.fromCodePoint(value) : fallback;
}
