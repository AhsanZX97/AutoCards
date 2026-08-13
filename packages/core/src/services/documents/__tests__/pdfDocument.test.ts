import { describe, expect, it } from 'vitest';
import { buildPdfDocument } from '../pdfDocument';

const base = { filename: 'notes.pdf', size: 2048, pageCount: 2 };

describe('buildPdfDocument', () => {
  it('keeps one entry per page and joins them into the text', () => {
    const document = buildPdfDocument({ ...base, pages: ['page one', 'page two'] });

    expect(document.pages).toEqual(['page one', 'page two']);
    expect(document.text).toBe('page one\n\npage two');
    expect(document.pageCount).toBe(2);
    expect(document.kind).toBe('pdf');
  });

  it('does not flag a readable document as synthetic', () => {
    const document = buildPdfDocument({ ...base, pages: ['page one', 'page two'] });
    expect(document.synthetic).toBeUndefined();
  });

  it('keeps a blank page that sits between pages with text', () => {
    const document = buildPdfDocument({ ...base, pageCount: 3, pages: ['intro', '', 'outro'] });

    expect(document.pages).toEqual(['intro', '', 'outro']);
    expect(document.synthetic).toBeUndefined();
  });

  it('flags a document with no text layer as synthetic so a model refuses it', () => {
    const document = buildPdfDocument({ ...base, pages: ['', '   '] });

    expect(document.synthetic).toBe(true);
    expect(document.pages).toHaveLength(1);
    expect(document.text).toContain('notes.pdf');
    expect(document.text).toMatch(/scanned\/image-only/);
  });

  it('reports the document’s own page count even when nothing could be read', () => {
    const document = buildPdfDocument({ ...base, pageCount: 12, pages: Array(12).fill('') });
    expect(document.pageCount).toBe(12);
  });

  it('carries a title through when the file declares one', () => {
    const document = buildPdfDocument({ ...base, pages: ['text'], title: 'Cell Biology' });
    expect(document.title).toBe('Cell Biology');
  });

  it('omits the title rather than sending an empty one', () => {
    const document = buildPdfDocument({ ...base, pages: ['text'] });
    expect('title' in document).toBe(false);
  });
});
