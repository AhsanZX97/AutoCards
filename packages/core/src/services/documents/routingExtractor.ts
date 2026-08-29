import type { ExtractedDocument } from '../../types';
import { ImageExtractor } from './imageExtractor';
import { OfficeExtractor } from './officeExtractor';
import { TextExtractor } from './textExtractor';
import {
  DocumentExtractionError,
  describeUnsupported,
  documentKindOf,
  type DocumentExtractor,
  type DocumentSource,
} from './types';

/**
 * Picks an extractor by file extension.
 *
 * The PDF reader is injected rather than constructed here because it is the one
 * that cannot run everywhere: `pdf.js` needs a browser worker, so mobile hands
 * in a stub while web hands in the real thing. Everything else is plain
 * JavaScript over bytes and works the same in both.
 *
 * Extension rather than MIME type, because browsers disagree about the MIME
 * for `.docx` and `.md` and report an empty string often enough that trusting
 * it would reject files that are perfectly readable.
 */
export class RoutingDocumentExtractor implements DocumentExtractor {
  readonly id = 'routing';

  private readonly office = new OfficeExtractor();
  private readonly text = new TextExtractor();
  private readonly image = new ImageExtractor();

  constructor(private readonly pdf: DocumentExtractor) {}

  async extract(source: DocumentSource): Promise<ExtractedDocument> {
    switch (documentKindOf(source.name)) {
      case 'pdf':
        return this.pdf.extract(source);
      case 'slides':
      case 'document':
        return this.office.extract(source);
      case 'text':
        return this.text.extract(source);
      case 'image':
        return this.image.extract(source);
      default:
        // Reached when a file slips past the picker's `accept` filter — a
        // drag-and-drop, or a browser that ignores it.
        throw new DocumentExtractionError(describeUnsupported(source.name));
    }
  }
}
