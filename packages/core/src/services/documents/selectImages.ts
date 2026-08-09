import type { DocumentImage } from '../../types';

/**
 * Which pictures out of a file are worth paying a vision model to look at.
 *
 * Every image sent costs roughly a thousand tokens or more, so the job here is
 * to spend that on the two or three diagrams that carry meaning and skip the
 * forty logos, bullets and dividers that do not. There is no way to know which
 * is which without looking, so this uses the two signals available for free:
 * how big the file is, and whether the same bytes appear on every page.
 */

/** Below this, an image is a bullet, a divider, a rule or a corner logo. */
export const MIN_CONTENT_IMAGE_BYTES = 15_000;

/** Beyond a handful, the model is skimming pictures rather than reading them. */
export const MAX_IMAGES = 8;

/**
 * Ceiling on the encoded bytes sent in one request. Roughly 4MB, comfortably
 * inside what the API accepts and about as much as is worth paying for.
 */
export const MAX_IMAGE_PAYLOAD_BYTES = 4_000_000;

export interface CandidateImage {
  bytes: Uint8Array;
  /** e.g. `image/png`. */
  mediaType: string;
  /** 1-based page or slide, when the format records it. */
  page?: number;
}

export interface SelectImagesOptions {
  maxImages?: number;
  maxPayloadBytes?: number;
}

export function selectImages(
  candidates: readonly CandidateImage[],
  options: SelectImagesOptions = {},
): DocumentImage[] {
  const maxImages = options.maxImages ?? MAX_IMAGES;
  const maxPayload = options.maxPayloadBytes ?? MAX_IMAGE_PAYLOAD_BYTES;

  const seen = new Set<string>();
  const worthLooking: Array<{ candidate: CandidateImage; order: number }> = [];

  candidates.forEach((candidate, order) => {
    if (candidate.bytes.byteLength < MIN_CONTENT_IMAGE_BYTES) return;
    // A template logo is byte-identical on every slide; sending it sixteen
    // times buys sixteen descriptions of the same logo.
    const fingerprint = fingerprintOf(candidate.bytes);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    worthLooking.push({ candidate, order });
  });

  // Size is a crude proxy for "carries information" — a full-slide diagram is
  // far heavier than a decorative flourish that cleared the floor above.
  const chosen = [...worthLooking].sort(
    (a, b) => b.candidate.bytes.byteLength - a.candidate.bytes.byteLength,
  );

  const kept: Array<{ candidate: CandidateImage; order: number }> = [];
  let payload = 0;
  for (const entry of chosen) {
    if (kept.length >= maxImages) break;
    const size = entry.candidate.bytes.byteLength;
    if (payload + size > maxPayload) continue;
    kept.push(entry);
    payload += size;
  }

  // Back into the order they appear in the document, so "slide 3, then slide 7"
  // reads the way the deck does.
  kept.sort((a, b) => a.order - b.order);

  return kept.map(({ candidate }) => ({
    dataUrl: `data:${candidate.mediaType};base64,${toBase64(candidate.bytes)}`,
    ...(candidate.page === undefined ? {} : { page: candidate.page }),
    bytes: candidate.bytes.byteLength,
  }));
}

/**
 * Cheap stand-in for a hash: length plus a scatter of bytes from across the
 * image. Two different pictures colliding would cost one dropped image, which
 * is not worth pulling in a real digest for.
 */
function fingerprintOf(bytes: Uint8Array): string {
  const marks: number[] = [bytes.byteLength];
  const step = Math.max(1, Math.floor(bytes.byteLength / 16));
  for (let index = 0; index < bytes.byteLength; index += step) {
    marks.push(bytes[index] as number);
  }
  return marks.join(',');
}

/** Node's `Buffer`, reached through `globalThis` so the web build needs no node types. */
interface NodeBufferCtor {
  from(bytes: Uint8Array): { toString(encoding: string): string };
}

function toBase64(bytes: Uint8Array): string {
  // `btoa` is browser-only and `Buffer` is Node-only; the extractors run in
  // both, so prefer whichever exists.
  if (typeof btoa === 'function') {
    let binary = '';
    // Chunked to stay clear of the argument-count limit on large images.
    const chunk = 0x8000;
    for (let index = 0; index < bytes.byteLength; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  }

  const nodeBuffer = (globalThis as { Buffer?: NodeBufferCtor }).Buffer;
  if (nodeBuffer) return nodeBuffer.from(bytes).toString('base64');
  throw new Error('No base64 encoder available in this environment.');
}
