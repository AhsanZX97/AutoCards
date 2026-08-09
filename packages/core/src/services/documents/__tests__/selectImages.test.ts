import { describe, expect, it } from 'vitest';
import { MAX_IMAGES, MAX_IMAGE_PAYLOAD_BYTES, MIN_CONTENT_IMAGE_BYTES, selectImages } from '../selectImages';
import type { CandidateImage } from '../selectImages';

/** An image of `bytes`, distinguishable by `seed`. */
function candidate(seed: string, bytes: number, page?: number): CandidateImage {
  return {
    bytes: new Uint8Array(bytes).fill(seed.charCodeAt(0)),
    mediaType: 'image/png',
    ...(page === undefined ? {} : { page }),
  };
}

describe('selectImages', () => {
  it('keeps a content-sized image', () => {
    const chosen = selectImages([candidate('a', MIN_CONTENT_IMAGE_BYTES * 4)]);
    expect(chosen).toHaveLength(1);
    expect(chosen[0]?.dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('drops images too small to be anything but decoration', () => {
    // Bullets, dividers and corner logos are all tiny; sending them costs a
    // thousand tokens each to be told there is a logo.
    expect(selectImages([candidate('a', MIN_CONTENT_IMAGE_BYTES - 1)])).toHaveLength(0);
  });

  it('sends a repeated image once', () => {
    // A template logo appears on every slide and is the same bytes each time.
    const logo = candidate('a', MIN_CONTENT_IMAGE_BYTES * 4);
    const chosen = selectImages([logo, logo, logo, candidate('b', MIN_CONTENT_IMAGE_BYTES * 4)]);
    expect(chosen).toHaveLength(2);
  });

  it('keeps the page each image came from', () => {
    const chosen = selectImages([candidate('a', MIN_CONTENT_IMAGE_BYTES * 4, 7)]);
    expect(chosen[0]?.page).toBe(7);
  });

  it('never sends more than the image cap', () => {
    const many = Array.from({ length: MAX_IMAGES + 5 }, (_u, index) =>
      candidate(String.fromCharCode(97 + index), MIN_CONTENT_IMAGE_BYTES * 4),
    );
    expect(selectImages(many)).toHaveLength(MAX_IMAGES);
  });

  it('prefers the largest images when it has to choose', () => {
    // Size is the best available proxy for "this is the diagram, not the icon".
    const small = candidate('s', MIN_CONTENT_IMAGE_BYTES * 2);
    const large = candidate('l', MIN_CONTENT_IMAGE_BYTES * 40);
    const chosen = selectImages([small, large], { maxImages: 1 });
    expect(chosen[0]?.bytes).toBeGreaterThan(small.bytes.byteLength);
  });

  it('returns them in document order even after picking by size', () => {
    const first = candidate('a', MIN_CONTENT_IMAGE_BYTES * 2, 1);
    const second = candidate('b', MIN_CONTENT_IMAGE_BYTES * 40, 2);
    expect(selectImages([first, second]).map((image) => image.page)).toEqual([1, 2]);
  });

  it('stops before the payload would get out of hand', () => {
    const huge = Array.from({ length: 6 }, (_u, index) =>
      candidate(String.fromCharCode(97 + index), Math.floor(MAX_IMAGE_PAYLOAD_BYTES / 2)),
    );
    const chosen = selectImages(huge);

    const total = chosen.reduce((sum, image) => sum + image.bytes, 0);
    expect(total).toBeLessThanOrEqual(MAX_IMAGE_PAYLOAD_BYTES);
    expect(chosen.length).toBeGreaterThan(0);
  });

  it('has nothing to say about a file with no pictures in it', () => {
    expect(selectImages([])).toEqual([]);
  });
});
