import { describe, expect, it } from 'vitest';
import { documentFromText, TextExtractor } from '../textExtractor';
import { sourceFromString } from './documentFixtures';

const extractor = new TextExtractor();

describe('TextExtractor', () => {
  it('reads a plain text file as its own contents', async () => {
    const document = await extractor.extract(sourceFromString('notes.txt', 'Chlorophyll absorbs light.'));

    expect(document.text).toBe('Chlorophyll absorbs light.');
    expect(document.filename).toBe('notes.txt');
    expect(document.kind).toBe('text');
  });

  it('reports no page count, because a text file has no pages', async () => {
    const document = await extractor.extract(sourceFromString('notes.txt', 'Anything at all.'));
    expect(document.pageCount).toBeUndefined();
  });

  it('takes the deck title from a markdown heading when there is one', async () => {
    const document = await extractor.extract(
      sourceFromString('week-3.md', '# Cell Biology\n\nMitochondria make ATP.'),
    );
    expect(document.title).toBe('Cell Biology');
  });

  it('leaves the title alone when the file does not open with a heading', async () => {
    const document = await extractor.extract(sourceFromString('week-3.md', 'Mitochondria make ATP.'));
    expect(document.title).toBeUndefined();
  });

  it('flags an empty file rather than sending blank text to the model', async () => {
    const document = await extractor.extract(sourceFromString('empty.txt', '   \n  '));
    expect(document.synthetic).toBe(true);
  });

  it('decodes text written as UTF-8', async () => {
    const document = await extractor.extract(sourceFromString('accents.txt', 'Prüfung — café'));
    expect(document.text).toBe('Prüfung — café');
  });
});

describe('documentFromText', () => {
  it('wraps pasted text as a document with no file behind it', () => {
    const document = documentFromText('Mitochondria make ATP.', 'Pasted text');

    expect(document.text).toBe('Mitochondria make ATP.');
    expect(document.filename).toBe('Pasted text');
    expect(document.kind).toBe('text');
    expect(document.pages).toEqual(['Mitochondria make ATP.']);
  });

  it('trims the blank lines a paste picks up from the clipboard', () => {
    expect(documentFromText('\n\n  Mitochondria make ATP.  \n', 'Pasted text').text).toBe(
      'Mitochondria make ATP.',
    );
  });

  it('measures size in bytes, so a paste is counted the way an upload is', () => {
    // Two characters, three bytes each in UTF-8 — a character count would say 2.
    expect(documentFromText('日本', 'Pasted text').size).toBe(6);
  });

  it('takes a title from a markdown heading in the paste', () => {
    expect(documentFromText('# Cell Biology\n\nMitochondria make ATP.', 'Pasted text').title).toBe(
      'Cell Biology',
    );
  });

  it('flags an empty paste so the model refuses instead of inventing a deck', () => {
    expect(documentFromText('   \n ', 'Pasted text').synthetic).toBe(true);
  });

  it('leaves a paste with content unflagged', () => {
    expect(documentFromText('Mitochondria make ATP.', 'Pasted text').synthetic).toBeUndefined();
  });
});
