/**
 * Client-side DOCX → PDF conversion for the upload flows.
 *
 * The conversion itself lives on the server (`/api/docx-to-pdf`): the
 * `@docx-editor.dev/docx-to-pdf` package is a Node library, so it cannot run in
 * the browser. Everything downstream of the dropper — the sign page's document
 * record, the verify page's preview — only ever deals in PDFs, so the dropper
 * converts on the way in and hands the rest of the app a uniform input.
 *
 * Only the sign page uses this: the shared dropper takes an `allowDocx` prop
 * that is off by default, so the verify page stays PDF-only. Verification needs
 * a genuinely signed PDF, and converting an editable DOCX would let unsigned
 * input reach the status panel.
 *
 * The editor's "Save as PDF" / "Sign" actions convert the same way; they go
 * through their own inline copy of this round-trip because they already hold
 * DOCX *bytes* from the editor rather than a user-picked file.
 */

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Identify by MIME *and* extension. Some platforms report an empty `type` for
 * `.docx` (notably when a file arrives from a drag source that does not
 * populate it), so the name is the reliable fallback.
 */
export function isDocx(file: File) {
  return file.type === DOCX_MIME || file.name.toLowerCase().endsWith(".docx");
}

export function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/**
 * Name a converted document the way the user expects: drop the `.docx` rather
 * than stacking `.pdf` on top of it, and never produce a bare ".pdf".
 */
export function pdfNameFor(name: string) {
  const stem = name.replace(/\.(docx|pdf)$/i, "").trim();
  return `${stem || "document"}.pdf`;
}

/**
 * Convert a DOCX file to a PDF `File`, ready to drop into the document record.
 *
 * Rejects with a message meant for the user — the server's JSON body already
 * carries an Indonesian explanation, and it is passed through when present.
 */
export async function convertDocxToPdf(file: File): Promise<File> {
  const response = await fetch("/api/docx-to-pdf", {
    method: "POST",
    headers: { "Content-Type": DOCX_MIME },
    body: file,
  });

  if (!response.ok) {
    let detail = `Konversi PDF gagal (${response.status}).`;
    try {
      const body = await response.json();
      if (body?.message) detail = body.message;
    } catch {
      // The server may answer with a non-JSON body (proxy error, HTML page);
      // the status-based message above is still actionable.
    }
    throw new Error(detail);
  }

  const blob = await response.blob();
  return new File([blob], pdfNameFor(file.name), { type: "application/pdf" });
}
