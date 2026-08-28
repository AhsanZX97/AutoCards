import * as FileSystem from 'expo-file-system/legacy';
import { toByteArray } from 'base64-js';
import type { DocumentSource } from '@autocards/core';

/**
 * Adapts an `expo-document-picker` result to the shape core's extractors expect.
 *
 * Not `fetch(uri).arrayBuffer()`: React Native's fetch polyfill does not
 * reliably return real bytes for a local picker URI — a `content://` URI on
 * Android in particular can come back empty or truncated with no error
 * thrown, which reads as a corrupted file at the extractor rather than a
 * failed read here. `expo-file-system` reading base64 is the path Expo
 * documents for getting the actual bytes back, on both platforms.
 */
export function documentSourceFromUri(uri: string, name: string, size: number): DocumentSource {
  return {
    name,
    size,
    async arrayBuffer() {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = toByteArray(base64);
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return buffer;
    },
  };
}
