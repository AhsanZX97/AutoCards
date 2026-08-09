import { describe, expect, it } from 'vitest';
import { OfficeExtractor } from '../officeExtractor';
import { DocumentExtractionError } from '../types';
import { MIN_CONTENT_IMAGE_BYTES } from '../selectImages';
import { docxFile, pptxFile, sourceFromString } from './documentFixtures';

const extractor = new OfficeExtractor();

describe('OfficeExtractor — Word', () => {
  it('reads the paragraphs out of a .docx', async () => {
    const document = await extractor.extract(
      docxFile('handout.docx', ['Mitochondria make ATP.', 'Chloroplasts capture light.']),
    );

    expect(document.text).toContain('Mitochondria make ATP.');
    expect(document.text).toContain('Chloroplasts capture light.');
    expect(document.kind).toBe('document');
  });

  it('keeps paragraphs apart rather than running them into one line', async () => {
    const document = await extractor.extract(docxFile('handout.docx', ['First.', 'Second.']));
    expect(document.text).toBe('First.\nSecond.');
  });

  it('reports no page count for a Word document', async () => {
    // Word decides pagination at render time from the fonts and paper size, so
    // there is no page count in the file to report.
    const document = await extractor.extract(docxFile('handout.docx', ['Anything.']));
    expect(document.pageCount).toBeUndefined();
  });

  it('takes the title from document properties when Word recorded one', async () => {
    const document = await extractor.extract(
      docxFile('handout.docx', ['Body text.'], { title: 'Week 3 Handout' }),
    );
    expect(document.title).toBe('Week 3 Handout');
  });

  it('flags a document with no readable text', async () => {
    const document = await extractor.extract(docxFile('empty.docx', []));
    expect(document.synthetic).toBe(true);
  });
});

describe('OfficeExtractor — PowerPoint', () => {
  it('reads each slide as its own page, in order', async () => {
    const document = await extractor.extract(
      pptxFile('lecture.pptx', [{ body: ['Slide one title'] }, { body: ['Slide two title'] }]),
    );

    expect(document.pages).toEqual(['Slide one title', 'Slide two title']);
    expect(document.pageCount).toBe(2);
    expect(document.kind).toBe('slides');
  });

  it('orders slides numerically rather than by how the zip stored them', async () => {
    // slide10 sorts before slide2 as a string, which would shuffle a long deck.
    const slides = Array.from({ length: 11 }, (_unused, index) => ({ body: [`Slide ${index + 1}`] }));
    const document = await extractor.extract(pptxFile('long.pptx', slides));

    expect(document.pages[1]).toBe('Slide 2');
    expect(document.pages[10]).toBe('Slide 11');
  });

  it('includes speaker notes, which are usually where the teaching actually is', async () => {
    const document = await extractor.extract(
      pptxFile('lecture.pptx', [{ body: ['Photosynthesis'], notes: ['Mention the Calvin cycle here.'] }]),
    );

    expect(document.text).toContain('Photosynthesis');
    expect(document.text).toContain('Mention the Calvin cycle here.');
  });

  it('sends a repeated title once', async () => {
    // Decks routinely carry the title twice — a title placeholder with a
    // heading textbox sitting on top of it — which reaches the model as
    // "Ribosomes Ribosomes" and over-weights the word for no reason.
    const document = await extractor.extract(
      pptxFile('lecture.pptx', [{ body: ['Ribosomes', 'Ribosomes', 'Site of protein synthesis'] }]),
    );

    expect(document.text).toBe('Ribosomes\nSite of protein synthesis');
  });

  it('keeps a repeated line that is not adjacent, because it heads a second column', async () => {
    // A two-column slide legitimately says "Examples:" over each column.
    const document = await extractor.extract(
      pptxFile('lecture.pptx', [{ body: ['Examples:', 'Bacteria', 'Examples:', 'Plant cells'] }]),
    );

    expect(document.text).toBe('Examples:\nBacteria\nExamples:\nPlant cells');
  });

  it('reads a deck that has no notes at all', async () => {
    const document = await extractor.extract(pptxFile('lecture.pptx', [{ body: ['Just a slide'] }]));
    expect(document.text).toContain('Just a slide');
  });
});

describe('OfficeExtractor — pictures', () => {
  const CONTENT = MIN_CONTENT_IMAGE_BYTES * 4;

  it('pulls the pictures off the slides', async () => {
    const document = await extractor.extract(
      pptxFile('lecture.pptx', [{ body: ['Cell structure'], images: { 'diagram.png': CONTENT } }]),
    );

    expect(document.images).toHaveLength(1);
    expect(document.images?.[0]?.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('records which slide each picture came from', async () => {
    const document = await extractor.extract(
      pptxFile('lecture.pptx', [
        { body: ['Intro'] },
        { body: ['Plant cell'], images: { 'plant.png': CONTENT } },
      ]),
    );

    expect(document.images?.[0]?.page).toBe(2);
  });

  it('leaves the pictures out when the deck has none', async () => {
    const document = await extractor.extract(pptxFile('lecture.pptx', [{ body: ['Just text'] }]));
    expect(document.images).toBeUndefined();
  });

  it('ignores decoration too small to be worth looking at', async () => {
    const document = await extractor.extract(
      pptxFile('lecture.pptx', [{ body: ['Title'], images: { 'bullet.png': 400 } }]),
    );
    expect(document.images).toBeUndefined();
  });

  it('ignores media the slides never reference', async () => {
    // Masters, layouts and themes carry the template's own furniture. Only
    // pictures a slide actually places are content.
    const withOrphan = pptxFile('lecture.pptx', [
      { body: ['Title'], images: { 'used.png': CONTENT } },
    ]);
    const document = await extractor.extract(withOrphan);
    expect(document.images).toHaveLength(1);
  });

  it('sends a logo repeated on every slide only once', async () => {
    const document = await extractor.extract(
      pptxFile('lecture.pptx', [
        { body: ['One'], images: { 'logo.png': CONTENT } },
        { body: ['Two'], images: { 'logo.png': CONTENT } },
        { body: ['Three'], images: { 'logo.png': CONTENT } },
      ]),
    );

    expect(document.images).toHaveLength(1);
  });

  it('still reads the text out of a deck full of pictures', async () => {
    const document = await extractor.extract(
      pptxFile('lecture.pptx', [{ body: ['Mitochondria'], images: { 'diagram.png': CONTENT } }]),
    );
    expect(document.text).toContain('Mitochondria');
  });
});

describe('OfficeExtractor — failures', () => {
  it('rejects a file that is not a zip container at all', async () => {
    await expect(extractor.extract(sourceFromString('broken.docx', 'not a zip'))).rejects.toBeInstanceOf(
      DocumentExtractionError,
    );
  });

  it('names the file in the error so a multi-file upload says which one failed', async () => {
    await expect(extractor.extract(sourceFromString('broken.docx', 'not a zip'))).rejects.toThrow(
      /broken\.docx/,
    );
  });
});
