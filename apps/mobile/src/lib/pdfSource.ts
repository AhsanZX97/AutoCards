import type { DocumentSource } from '@autocards/core';

/** Adapts an `expo-document-picker` result to the shape core's extractors expect. */
export function documentSourceFromUri(uri: string, name: string, size: number): DocumentSource {
  return {
    name,
    size,
    async arrayBuffer() {
      const response = await fetch(uri);
      return response.arrayBuffer();
    },
  };
}
