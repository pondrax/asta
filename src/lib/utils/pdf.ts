import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFSignature,
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
export async function drawFooter(
  bytes: Uint8Array | ArrayBuffer,
  opts: {
    text?: string;
    imageBase64?: string;
    paddingY?: number;
    lineHeight?: number;
    page?: number;
  }
) {
  const { text = '', imageBase64, paddingY = 20, lineHeight = 14, page: onlyPage } = opts;

  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

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

  for (const page of targets) {
    const y = paddingY;
    let imgWidth = 0;
    let imgHeight = 0;

    if (image) {
      imgWidth = 32;
      imgHeight = (32 * image.height) / image.width;

      page.drawImage(image, {
        x: 20,
        y: y - 5,
        width: imgWidth,
        height: imgHeight
      });
    }

    if (text) {
      const textLines = text.split('\n');
      const textX = image ? 20 + imgWidth + 10 : 20;
      const textSize = 10;

      // Calculate starting Y position - center align with image if image exists
      const totalTextHeight = (textLines.length - 1) * lineHeight;
      let startY;

      if (image) {
        // Center text vertically with the image
        startY = y + (imgHeight - totalTextHeight) / 2 + (lineHeight - textSize);
      } else {
        // Use original position
        startY = y + 10;
      }

      // Draw each line
      textLines.forEach((line, index) => {
        page.drawText(line, {
          x: textX,
          y: startY - (index * lineHeight),
          size: textSize,
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

export async function isEncrypted(bytes: Uint8Array | ArrayBuffer): Promise<boolean> {
  try {
    await PDFDocument.load(bytes);
    return false;
  } catch (err: any) {
    return err?.name === 'EncryptedPDFError' || String(err?.message).includes('encrypted');
  }
}