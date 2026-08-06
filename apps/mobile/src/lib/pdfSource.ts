import type { PdfSource } from '@autocards/core';

/** Adapts an `expo-document-picker` result to the `PdfSource` shape core expects. */
export function pdfSourceFromUri(uri: string, name: string, size: number): PdfSource {
  return {
    name,
    size,
    async arrayBuffer() {
      const response = await fetch(uri);
      return response.arrayBuffer();
    },
  };
}
