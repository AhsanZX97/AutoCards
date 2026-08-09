import type { ExtractedDocument } from '../../types';
import type { DocumentExtractor, DocumentSource } from './types';

/** `# Heading` on the first non-blank line of a Markdown file. */
const LEADING_HEADING = /^\s*#{1,6}\s+(.+?)\s*$/m;

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
    const text = new TextDecoder('utf-8').decode(buffer).trim();
    const title = LEADING_HEADING.exec(text)?.[1]?.trim();

    return {
      filename: source.name,
      size: source.size,
      kind: 'text',
      // A flow format has no pages; the whole file is one run of text.
      pages: [text],
      text,
      ...(title ? { title } : {}),
      ...(text ? {} : { synthetic: true }),
    };
  }
}
