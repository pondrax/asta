import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  PDFSignature,
  rgb
} from 'pdf-lib';

// ---------------------------------------------------------
// Load PDF
// ---------------------------------------------------------
export async function loadPdf(bytes: Uint8Array | ArrayBuffer) {
  return PDFDocument.load(bytes);
}

// ---------------------------------------------------------
// Read all form fields
// ---------------------------------------------------------
export async function getAllFormFields(bytes: Uint8Array | ArrayBuffer) {
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  const output: Record<string, any> = {};

  for (const field of fields) {
    const name = field.getName();
    const type = field.constructor.name;

    let value: any = null;

    if (field instanceof PDFSignature) continue;
    if (field instanceof PDFTextField) value = field.getText();
    if (field instanceof PDFCheckBox) value = field.isChecked();
    if (field instanceof PDFRadioGroup) value = field.getSelected();
    if (field instanceof PDFDropdown) value = field.getSelected();
    if (field instanceof PDFOptionList) value = field.getSelected();

    output[name] = { type, value };
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
  const pdfDoc = await PDFDocument.load(bytes);
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
  }
) {
  const { text = '', imageBase64, paddingY = 20, lineHeight = 14 } = opts;

  const pdfDoc = await PDFDocument.load(bytes);

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

  for (const page of pdfDoc.getPages()) {
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

  const pdfDoc = await PDFDocument.load(bytes);
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

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

export async function hasSignature(bytes: Uint8Array | ArrayBuffer): Promise<boolean> {
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  const fields = form.getFields();

  return fields.some(field => field instanceof PDFSignature);
}