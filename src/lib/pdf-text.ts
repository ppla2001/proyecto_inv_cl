// Text extraction from PDFs that have a text layer (bank/broker statements).
// No OCR: if a PDF is just images this returns (almost) nothing, and the parser
// on top fails with a clear message. Server-side only.

import { extractText, getDocumentProxy } from "unpdf";

export function esPdf(bytes: Uint8Array): boolean {
  // "%PDF" magic number.
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

export async function textoDePdf(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
