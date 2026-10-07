// Renders a filled-in onboarding form (bank details, PF nomination, emergency
// contact, ...) as a plain printable A4 page for HR to print and the employee
// to sign. Helvetica only, so text is sanitised to WinAnsi first.

import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

export type FormField = { label: string; value: string };

const safe = (v: unknown) => String(v ?? "").replace(/[^\x20-\x7E -ÿ]/g, "-");

export async function renderFormPdf(input: {
  title: string; candidateName: string; reference: string; fields: FormField[];
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const WIDTH = 595.28;
  const HEIGHT = 841.89;
  const left = 56;
  const right = WIDTH - 56;
  const CONTENT_BOTTOM = 60;
  let page = doc.addPage([WIDTH, HEIGHT]);
  let y = HEIGHT - 64;
  let pageNum = 1;

  // Every field value can run to several wrapped lines (a long textarea answer,
  // or a future form with more fields than today's 6-field max) — this must not
  // silently draw past the bottom of the page, so each write checks the space
  // it needs first and starts a fresh page if there isn't enough.
  const newPage = () => {
    pageNum += 1;
    page = doc.addPage([WIDTH, HEIGHT]);
    y = HEIGHT - 64;
    page.drawText(safe(`${input.title} — continued`), { x: left, y, size: 10, font: bold, color: rgb(0.4, 0.44, 0.5) });
    y -= 24;
  };
  const ensure = (h: number) => { if (y - h < CONTENT_BOTTOM) newPage(); };

  page.drawText("CCENTRIK", { x: left, y, size: 10, font: bold, color: rgb(0.19, 0.34, 0.84) });
  y -= 28;
  page.drawText(safe(input.title), { x: left, y, size: 18, font: bold, color: rgb(0.11, 0.13, 0.16) });
  y -= 20;
  page.drawText(`Reference ${safe(input.reference)}`, { x: left, y, size: 9, font, color: rgb(0.4, 0.44, 0.5) });
  y -= 32;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.75, color: rgb(0.89, 0.9, 0.92) });
  y -= 24;

  const row = (label: string, value: string) => {
    const lines = safe(value || "-").match(/.{1,90}/g) ?? ["-"];
    ensure(14 + lines.length * 15 + 8);
    page.drawText(safe(label).toUpperCase(), { x: left, y, size: 8, font: bold, color: rgb(0.4, 0.44, 0.5) });
    y -= 14;
    for (const line of lines) {
      page.drawText(line, { x: left, y, size: 11, font, color: rgb(0.11, 0.13, 0.16) });
      y -= 15;
    }
    y -= 8;
    page.drawLine({ start: { x: left, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 0.4, color: rgb(0.9, 0.91, 0.92) });
  };

  row("Employee name", input.candidateName);
  for (const f of input.fields) row(f.label, f.value);

  ensure(24 + 48 + 14);
  y -= 24;
  page.drawText("I confirm that the details above are true and correct.", { x: left, y, size: 10, font, color: rgb(0.11, 0.13, 0.16) });
  y -= 48;
  page.drawLine({ start: { x: left, y }, end: { x: left + 200, y }, thickness: 0.6, color: rgb(0.4, 0.44, 0.5) });
  page.drawLine({ start: { x: right - 200, y }, end: { x: right, y }, thickness: 0.6, color: rgb(0.4, 0.44, 0.5) });
  page.drawText("Employee signature", { x: left, y: y - 14, size: 9, font, color: rgb(0.4, 0.44, 0.5) });
  page.drawText("Date", { x: right - 200, y: y - 14, size: 9, font, color: rgb(0.4, 0.44, 0.5) });

  if (pageNum > 1) {
    for (const [i, pg] of doc.getPages().entries()) {
      pg.drawText(safe(`Page ${i + 1} of ${pageNum}`), { x: right - 70, y: 30, size: 7.5, font, color: rgb(0.4, 0.44, 0.5) });
    }
  }

  return doc.save();
}
