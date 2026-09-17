import { jsPDF } from 'jspdf';

/** Reads a File as a data URL — used for embedding an optional supporting
    image (e.g. a cancelled cheque photo) into the generated PDF. */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Turns a completed onboarding form into a simple, professional one-page
    PDF HR can print for a physical signature — this app has no PDF
    generation anywhere else, so this is intentionally plain (title, then
    each field as a label/value line) rather than a templated design system. */
export async function generateOnboardingFormPdf({ documentName, candidateName, schema, values }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 48;
  let y = 64;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Ccentrik — Employee Onboarding', marginX, y);
  y += 24;
  doc.setFontSize(13);
  doc.text(documentName, marginX, y);
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text(`Candidate: ${candidateName || '—'}`, marginX, y);
  y += 14;
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, marginX, y);
  y += 26;

  doc.setDrawColor(210);
  doc.line(marginX, y, 595 - marginX, y);
  y += 24;

  for (const f of schema) {
    if (f.type === 'file') continue; // handled separately below (embedded image)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(f.label, marginX, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    const value = String(values[f.key] ?? '').trim() || '—';
    const lines = doc.splitTextToSize(value, 595 - marginX * 2);
    doc.text(lines, marginX, y);
    y += lines.length * 14 + 12;
  }

  // Optional supporting image (e.g. cancelled cheque photo) — a fresh page
  // so it stays legible rather than squeezed under the text fields.
  const fileField = schema.find((f) => f.type === 'file');
  const supportingFile = fileField ? values[fileField.key] : null;
  if (supportingFile instanceof File) {
    try {
      const dataUrl = await fileToDataUrl(supportingFile);
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(fileField.label, marginX, 56);
      const format = supportingFile.type.includes('png') ? 'PNG' : 'JPEG';
      // Fixed box rather than height:0 "auto" — jsPDF's auto-scale behavior
      // varies by version, and a silently-zero-height image would just be
      // an invisible blank page, which is worse than a fixed reasonable size.
      doc.addImage(dataUrl, format, marginX, 72, 595 - marginX * 2, 380);
    } catch {
      // Non-fatal — the text fields above are the primary record; a failed
      // image embed shouldn't block the whole submission.
    }
  }

  y += 30;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.text('Generated electronically from the candidate\'s onboarding submission.', marginX, Math.min(y, 780));

  return doc.output('blob');
}
