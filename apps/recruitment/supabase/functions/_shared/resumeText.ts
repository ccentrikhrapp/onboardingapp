// Shared resume text extraction (PDF / DOCX / plain text) — used by
// parse-resume (autofill) and submit-application (ATS scoring against the
// job description), so both read exactly the same text for a given file.

import { extractText as extractPdfText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import JSZip from "https://esm.sh/jszip@3.10.1";

async function docxToText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const doc = zip.file("word/document.xml");
  if (!doc) return "";
  const xml = await doc.async("string");
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .trim();
}

async function pdfToText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractPdfText(pdf, { mergePages: true });
  return text;
}

/** `path` only needs to end in .pdf/.docx — used purely to pick the extractor. */
export async function extractResumeText(bytes: Uint8Array, path: string): Promise<string> {
  const name = path.toLowerCase();
  if (name.endsWith(".pdf")) return pdfToText(bytes);
  if (name.endsWith(".docx")) return docxToText(bytes);
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/[^\x09\x0a\x0d\x20-\x7e]+/g, " ");
}
