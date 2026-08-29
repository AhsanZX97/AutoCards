import type { ExtractedDocument } from '../../types';
import type { DocumentExtractor, DocumentSource } from './types';

/** `# Heading` on the first non-blank line of a Markdown file. */
const LEADING_HEADING = /^\s*#{1,6}\s+(.+?)\s*$/m;

/**
 * Wraps a run of text as a document, without a file behind it.
 *
 * Used by {@link TextExtractor} for an uploaded `.txt` or `.md`, and by the
 * create-deck screen for text pasted straight in. Both are the same thing to
 * everything downstream: the bytes are the document, so there is nothing to
 * parse and no page structure to recover.
 *
 * `size` is the UTF-8 byte length rather than the character count, so a pasted
 * passage is measured the same way an uploaded one is.
 */
export function documentFromText(text: string, filename: string): ExtractedDocument {
  const trimmed = text.trim();
  const title = LEADING_HEADING.exec(trimmed)?.[1]?.trim();

  return {
    filename,
    size: new TextEncoder().encode(trimmed).length,
    kind: 'text',
    // A flow format has no pages; the whole thing is one run of text.
    pages: [trimmed],
    text: trimmed,
    ...(title ? { title } : {}),
    // Nothing readable in it — a live model must refuse rather than write
    // cards about an empty page.
    ...(trimmed ? {} : { synthetic: true }),
  };
}

/**
 * Plain text and Markdown. There is nothing to parse — the bytes are the
 * document — so this is here mostly to give those formats the same shape as
 * everything else rather than special-casing them at the call site.
 *
 * Markdown is passed through with its syntax intact: the markers are a few
 * characters each and they tell the model what is a heading and what is a list,
 * which is worth more than the tokens stripping them would save.
 */
export class TextExtractor implements DocumentExtractor {
  readonly id = 'text';

  async extract(source: DocumentSource): Promise<ExtractedDocument> {
    const buffer = await source.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buffer);
    // The file's own size, not the trimmed text's: this is what was uploaded.
    return { ...documentFromText(text, source.name), size: source.size };
  }
}
