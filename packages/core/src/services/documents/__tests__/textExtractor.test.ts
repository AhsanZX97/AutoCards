import { describe, expect, it } from 'vitest';
import { TextExtractor } from '../textExtractor';
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
