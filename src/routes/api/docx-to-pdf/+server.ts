import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { exportPdf } from "@docx-editor.dev/docx-to-pdf";

const MAX_INPUT_BYTES = 64 * 1024 * 1024; // 64 MiB

export const POST: RequestHandler = async ({ request }) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document")) {
    throw error(415, "Content-Type harus application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  }

  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0) {
    throw error(400, "Dokumen kosong.");
  }
  if (buf.byteLength > MAX_INPUT_BYTES) {
    throw error(413, "Dokumen terlalu besar (maks 64 MiB).");
  }

  try {
    const result = await exportPdf(new Uint8Array(buf), {
      fidelityPolicy: "best-effort",
      comments: false,
      useSystemFonts: true,
    });

    const pdfBytes = new Uint8Array(result.bytes);
    return new Response(new Blob([pdfBytes], { type: "application/pdf" }), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="document.pdf"',
        "X-Pdf-Page-Count": String(result.pageCount),
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[docx-to-pdf] conversion failed:", e);
    throw error(500, `Konversi PDF gagal: ${message}`);
  }
};