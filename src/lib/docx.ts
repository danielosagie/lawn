/**
 * Client-side .docx import / export helpers.
 *
 * - Import: mammoth converts an uploaded .docx → HTML for the Tiptap editor.
 *   Preserves headings, paragraphs, bold/italic/underline, lists, tables.
 *   Loses things like custom styles and embedded images (mammoth's well-known
 *   limitations). Acceptable for typical Statement of Work documents.
 *
 * - Export: html-to-docx converts the editor's HTML → a Blob the user can
 *   download. Runs entirely in the browser so demo mode works without any
 *   server round-trip.
 *
 * Both libraries are loaded lazily (dynamic import) so they don't bloat the
 * initial bundle — they're only fetched the first time the user opens the
 * contract dialog and imports / exports.
 */

export interface DocxImportResult {
  html: string;
  warnings: string[];
}

export async function docxFileToHtml(file: File): Promise<DocxImportResult> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  // mammoth.convertToHtml expects { arrayBuffer } in browsers.
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      // Mammoth's default style map handles most things. We add a couple of
      // overrides for cleaner output.
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
      ],
    },
  );
  return {
    html: result.value || "<p></p>",
    warnings: result.messages.map((m) => m.message),
  };
}

export interface DocxExportOptions {
  /** File header HTML (optional). Use for a logo/letterhead. */
  headerHtml?: string;
  /** File footer HTML (optional). */
  footerHtml?: string;
  /** Filename hint when the browser saves. */
  filename?: string;
}

export async function htmlToDocxBlob(
  html: string,
  options: DocxExportOptions = {},
): Promise<Blob> {
  // html-to-docx ships an ESM build. Dynamic import keeps it out of the
  // main bundle until needed.
  const mod = await import("html-to-docx");
  const HTMLtoDOCX = (mod as { default?: unknown }).default ?? mod;

  // Wrap the editor HTML in a minimal document for cleaner output.
  const wrapped = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family: 'Times New Roman', serif; font-size: 12pt;">${html}</body>
</html>`;

  const result = await (HTMLtoDOCX as (
    html: string,
    header?: string,
    options?: Record<string, unknown>,
    footer?: string,
  ) => Promise<Blob | ArrayBuffer | Uint8Array>)(
    wrapped,
    options.headerHtml,
    {
      orientation: "portrait",
      pageNumber: true,
      margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch
      title: options.filename ?? "Contract",
    },
    options.footerHtml,
  );

  // html-to-docx returns Blob in browser, Uint8Array/Buffer in node. Normalize.
  if (result instanceof Blob) return result;
  if (result instanceof ArrayBuffer) {
    return new Blob([result], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }
  // Uint8Array / Buffer case — copy the underlying bytes into a fresh
  // ArrayBuffer so we don't trip TS's SharedArrayBuffer narrowing and so the
  // resulting Blob is detached from the original allocator.
  const u8 = result as Uint8Array;
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return new Blob([ab], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke shortly after — too immediate breaks some browsers' download.
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
