import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFSignature,
  PDFFont,
  PDFName,
  PDFDict,
  PDFRef,
  PDFString,
  PDFHexString,
  StandardFonts,
  rgb
} from 'pdf-lib';

// ---------------------------------------------------------
// Load PDF
// ---------------------------------------------------------
export async function loadPdf(bytes: Uint8Array | ArrayBuffer) {
  return PDFDocument.load(bytes, { ignoreEncryption: true });
}

// ---------------------------------------------------------
// Read all form fields
// ---------------------------------------------------------
export async function getAllFormFields(bytes: Uint8Array | ArrayBuffer) {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  const output: Record<string, any> = {};

  for (const field of fields) {
    const name = field.getName();
    const type = field.constructor.name;

    let value: any = null;
    let multiline = false;

    if (field instanceof PDFSignature) continue;
    if (field instanceof PDFTextField) {
      value = field.getText();
      multiline = field.isMultiline();
    }
    if (field instanceof PDFCheckBox) value = field.isChecked();
    if (field instanceof PDFRadioGroup) value = field.getSelected();
    if (field instanceof PDFDropdown) value = field.getSelected();
    if (field instanceof PDFOptionList) value = field.getSelected();

    output[name] = { type, value, multiline };
  }

  return output;
}

// ---------------------------------------------------------
// Fill form fields safely
// ---------------------------------------------------------
export async function fillFormFields(
  bytes: Uint8Array | ArrayBuffer,
  values: Record<string, string | boolean>
) {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();

  Object.entries(values).forEach(([name, value]) => {
    const field = form.getFieldMaybe(name);
    if (!field) return;

    // text input
    if (field instanceof PDFTextField && typeof value === 'string') {
      // console.log(field.constructor.name, name, value);
      field.setText(value);
    }

    // checkbox
    if (field instanceof PDFCheckBox) {
      value ? field.check() : field.uncheck();
    }

    // radio
    if (field instanceof PDFRadioGroup && typeof value === 'string') {
      field.select(value);
    }

    // dropdown
    if (field instanceof PDFDropdown && typeof value === 'string') {
      field.select(value);
    }

    // option list
    if (field instanceof PDFOptionList && typeof value === 'string') {
      field.select(value);
    }
  });

  form.flatten();
  return pdfDoc.save();
}

// ---------------------------------------------------------
// Draw footer (image + text)
// ---------------------------------------------------------
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];

  // Break words wider than the line box so nothing overflows horizontally.
  const pushWord = (word: string): string => {
    let current = '';
    for (const ch of word) {
      if (current && font.widthOfTextAtSize(current + ch, size) > maxWidth) {
        lines.push(current);
        current = ch;
      } else {
        current += ch;
      }
    }
    return current;
  };

  for (const raw of text.split('\n')) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let line = pushWord(words[0]);
    for (let i = 1; i < words.length; i++) {
      const candidate = `${line} ${words[i]}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = pushWord(words[i]);
      }
    }
    lines.push(line);
  }

  return lines;
}

export async function drawFooter(
  bytes: Uint8Array | ArrayBuffer,
  opts: {
    text?: string;
    imageBase64?: string;
    paddingY?: number;
    maxHeight?: number;
    page?: number;
  }
) {
  const {
    text = '',
    imageBase64,
    paddingY = 20,
    maxHeight = 60,
    page: onlyPage
  } = opts;

  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let image;
  if (imageBase64) {
    const imageBytes = Uint8Array.from(
      atob(imageBase64)
        .split('')
        .map((c) => c.charCodeAt(0))
    );
    try {
      image = await pdfDoc.embedPng(imageBytes);
    } catch {
      image = await pdfDoc.embedJpg(imageBytes);
    }
  }

  const pages = pdfDoc.getPages();
  const targets =
    onlyPage && pages[onlyPage - 1] ? [pages[onlyPage - 1]] : pages;

  const marginX = 20;
  const gap = 10;
  const baseSize = 10;
  const baseImageSize = 32;

  for (const page of targets) {
    const y = paddingY;
    const pageWidth = page.getWidth();
    const maxWidth = pageWidth - marginX * 2;
    const imgAspect = image ? image.height / image.width : 0;

    // Auto-fit: pick the largest font (and matching QR) whose wrapped text
    // fits both the page width and the footer's height band.
    let size = baseSize;
    let lines: string[] = text ? [text] : [];
    let imgWidth = 0;
    let imgHeight = 0;
    let lineHeight = baseSize * 1.4;

    for (let candidate = baseSize; candidate >= 5; candidate -= 0.5) {
      const w = image ? Math.max(12, baseImageSize * (candidate / baseSize)) : 0;
      const h = w * imgAspect;
      const textWidth = maxWidth - (image ? w + gap : 0);
      if (textWidth <= 0) continue;

      const lh = candidate * 1.4;
      const wrapped = wrapText(text, font, candidate, textWidth);
      const blockHeight = Math.max(h, wrapped.length * lh);

      size = candidate;
      lines = wrapped;
      imgWidth = w;
      imgHeight = h;
      lineHeight = lh;

      if (blockHeight <= maxHeight) break;
    }

    if (image) {
      page.drawImage(image, {
        x: marginX,
        y: y - 5,
        width: imgWidth,
        height: imgHeight
      });
    }

    if (text) {
      const textX = image ? marginX + imgWidth + gap : marginX;
      const totalTextHeight = (lines.length - 1) * lineHeight;
      let startY = image
        ? y + (imgHeight - totalTextHeight) / 2 + (lineHeight - size)
        : y + totalTextHeight + size * 0.25;

      // Wrapped text can be taller than the QR; lift the block so no line
      // drops below the footer margin.
      const minBaseline = image ? y - 5 : y;
      const lastBaseline = startY - totalTextHeight;
      if (lastBaseline < minBaseline) startY += minBaseline - lastBaseline;

      lines.forEach((line, index) => {
        page.drawText(line, {
          x: textX,
          y: startY - index * lineHeight,
          size,
          font,
          color: rgb(0, 0, 0)
        });
      });
    }
  }

  return pdfDoc.save();
}

type SignatureType = {
  id: string;
  imageBase64: string;
  page: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
};

export async function drawImages(
  bytes: Uint8Array | ArrayBuffer,
  signatures: SignatureType[],
  options?: {
    pageIndexing?: 'zero' | 'one'; // Default: 'one'
    coordinateSystem?: 'bottom-left' | 'top-left'; // Default: 'top-left'
  }
): Promise<Uint8Array> {
  const pageIndexing = options?.pageIndexing || 'one';
  const coordinateSystem = options?.coordinateSystem || 'top-left';

  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  const signaturesByPage: { [page: number]: SignatureType[] } = {};

  for (const signature of signatures) {
    let pageIndex = signature.page;

    // Convert to 0-indexed if using 1-indexed
    if (pageIndexing === 'one') {
      pageIndex = signature.page - 1;
    }

    if (pageIndex < 0 || pageIndex >= pages.length) {
      const displayedPage = pageIndexing === 'one' ? signature.page : pageIndex;
      throw new Error(`Page ${displayedPage} does not exist for signature ${signature.id}. Document has ${pages.length} pages.`);
    }

    if (!signaturesByPage[pageIndex]) {
      signaturesByPage[pageIndex] = [];
    }
    signaturesByPage[pageIndex].push(signature);
  }

  // Process each page
  for (const pageNumStr in signaturesByPage) {
    const pageNum = parseInt(pageNumStr);
    const pageSignatures = signaturesByPage[pageNum];
    const page = pages[pageNum];
    const { height: pageHeight } = page.getSize();

    for (const signature of pageSignatures) {
      const { imageBase64, originX, originY, width, height } = signature;

      const imageBytes = Uint8Array.from(
        atob(imageBase64)
          .split('')
          .map((c) => c.charCodeAt(0))
      );

      let image;
      try {
        image = await pdfDoc.embedPng(imageBytes);
      } catch {
        try {
          image = await pdfDoc.embedJpg(imageBytes);
        } catch (error) {
          console.warn(`Failed to embed image for signature ${signature.id}. Skipping.`);
          continue;
        }
      }

      // Calculate Y coordinate based on coordinate system
      let finalY = originY;
      if (coordinateSystem === 'top-left') {
        // Invert Y coordinate: top-left (0,0) to bottom-left coordinate system
        finalY = pageHeight - originY - height;
      }
      // If coordinateSystem is 'bottom-left', use originY as-is

      page.drawImage(image, {
        x: originX,
        y: finalY,
        width: width,
        height: height
      });
    }
  }

  return pdfDoc.save();
}

// ---------------------------------------------------------
// Draw mixed placements (signature image, text, date, checkbox)
//
// A generalisation of `drawImages` used by `/sign-v2`. All placements share the
// same geometry contract: PDF points, top-left origin, page-relative, 1-indexed
// page. Text/checkbox are baked client-side so the same document can be signed
// manually or handed to BSrE (which only draws the signature itself).
// ---------------------------------------------------------
export type PlacementKind = 'signature' | 'text' | 'date' | 'checkbox';

export type Placement = {
  id: string;
  /** Missing on legacy drafts — treated as `signature`. */
  kind?: PlacementKind;
  page: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  imageBase64?: string;
  text?: string;
  size?: number;
  checked?: boolean;
};

export async function drawPlacements(
  bytes: Uint8Array | ArrayBuffer,
  placements: Placement[],
  options?: { pageIndexing?: 'zero' | 'one' }
): Promise<Uint8Array> {
  const pageIndexing = options?.pageIndexing || 'one';

  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const byPage: { [page: number]: Placement[] } = {};

  for (const placement of placements) {
    let pageIndex = placement.page;
    if (pageIndexing === 'one') pageIndex = placement.page - 1;

    if (pageIndex < 0 || pageIndex >= pages.length) {
      const displayed =
        pageIndexing === 'one' ? placement.page : pageIndex;
      throw new Error(
        `Page ${displayed} does not exist for placement ${placement.id}. Document has ${pages.length} pages.`
      );
    }
    if (!byPage[pageIndex]) byPage[pageIndex] = [];
    byPage[pageIndex].push(placement);
  }

  for (const pageNumStr in byPage) {
    const pageNum = parseInt(pageNumStr);
    const page = pages[pageNum];
    const { height: pageHeight } = page.getSize();

    for (const placement of byPage[pageNumStr]) {
      const kind = placement.kind || 'signature';
      const { originX, originY, width, height } = placement;
      // top-left (0,0) → bottom-left coordinate system
      const finalY = pageHeight - originY - height;

      if (kind === 'signature') {
        if (!placement.imageBase64) continue;
        const imageBytes = Uint8Array.from(
          atob(placement.imageBase64)
            .split('')
            .map((c) => c.charCodeAt(0))
        );
        let image;
        try {
          image = await pdfDoc.embedPng(imageBytes);
        } catch {
          try {
            image = await pdfDoc.embedJpg(imageBytes);
          } catch {
            console.warn(
              `Failed to embed image for placement ${placement.id}. Skipping.`
            );
            continue;
          }
        }
        page.drawImage(image, {
          x: originX,
          y: finalY,
          width,
          height
        });
      } else if (kind === 'text' || kind === 'date') {
        const text = placement.text ?? '';
        if (!text) continue;
        const size = placement.size ?? 11;
        try {
          page.drawText(text, {
            x: originX,
            // The box top is the text top; step down by the font size to reach
            // the baseline so the rendered text stays inside the box.
            y: pageHeight - originY - size,
            size,
            font,
            color: rgb(0, 0, 0)
          });
        } catch (err) {
          console.warn(
            `Failed to draw text for placement ${placement.id}. Skipping.`,
            err
          );
        }
      } else if (kind === 'checkbox') {
        page.drawRectangle({
          x: originX,
          y: finalY,
          width,
          height,
          borderColor: rgb(0, 0, 0),
          borderWidth: 1
        });
        if (placement.checked) {
          // A tick made of two strokes, drawn inside the box corners.
          page.drawLine({
            start: { x: originX + width * 0.2, y: finalY + height * 0.5 },
            end: { x: originX + width * 0.42, y: finalY + height * 0.22 },
            thickness: 1.4,
            color: rgb(0, 0, 0)
          });
          page.drawLine({
            start: { x: originX + width * 0.42, y: finalY + height * 0.22 },
            end: { x: originX + width * 0.8, y: finalY + height * 0.8 },
            thickness: 1.4,
            color: rgb(0, 0, 0)
          });
        }
      }
    }
  }

  return pdfDoc.save();
}

// ---------------------------------------------------------
// Utility: Uint8Array → Blob
// ---------------------------------------------------------
export function toBlob(bytes: Uint8Array | ArrayBuffer) {
  return new Blob([new Uint8Array(bytes)], {
    type: 'application/pdf'
  });
}

// ---------------------------------------------------------
// Utility: Uint8Array → Base64
// ---------------------------------------------------------
export function toBase64(bytes: Uint8Array | ArrayBuffer) {
  return btoa(
    String.fromCharCode(...new Uint8Array(bytes))
  );
}

// ---------------------------------------------------------
// Utility: Download file in browser
// ---------------------------------------------------------
export function toDownload(
  bytes: Uint8Array | ArrayBuffer,
  filename = 'result.pdf'
) {
  const blob = toBlob(bytes);
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

export async function hasSignature(bytes: Uint8Array | ArrayBuffer): Promise<boolean> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  return fields.some(field => field instanceof PDFSignature);
}

/** Names of the digital signature fields already present in the document. */
export type SignatureInfo = {
  name: string;
  reason?: string;
  location?: string;
  date?: string;
};

function toPdfString(obj: unknown): string | undefined {
  if (obj instanceof PDFString || obj instanceof PDFHexString) {
    try {
      return obj.decodeText();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** "D:YYYYMMDDHHmmSS..." → "DD Mmm YYYY HH:mm". */
function formatPdfDate(value?: string): string | undefined {
  if (!value) return undefined;
  const m = /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(value);
  if (!m) return value;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
  ];
  const [, Y, Mo, D, H = '00', Mi = '00'] = m;
  return `${D} ${months[Number(Mo) - 1] ?? Mo} ${Y} ${H}:${Mi}`;
}

export async function getSignatures(
  bytes: Uint8Array | ArrayBuffer
): Promise<SignatureInfo[]> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const resolve = (obj: unknown): unknown =>
    obj instanceof PDFRef ? pdfDoc.context.lookup(obj) : obj;

  return form
    .getFields()
    .filter((field) => field instanceof PDFSignature)
    .map((field) => {
      const info: SignatureInfo = { name: field.getName() };
      try {
        const dict = (field as any).acroField?.dict as PDFDict | undefined;
        const v = resolve(dict?.get(PDFName.of('V')));
        const sigDict = v instanceof PDFDict ? v : undefined;
        const read = (key: string) =>
          toPdfString(resolve(sigDict?.get(PDFName.of(key))));
        info.name = read('Name') || info.name;
        info.reason = read('Reason');
        info.location = read('Location');
        info.date = formatPdfDate(read('M'));
      } catch {
        /* best-effort: keep the field name */
      }
      return info;
    });
}

export async function isEncrypted(bytes: Uint8Array | ArrayBuffer): Promise<boolean> {
  try {
    await PDFDocument.load(bytes);
    return false;
  } catch (err: any) {
    return err?.name === 'EncryptedPDFError' || String(err?.message).includes('encrypted');
  }
}