import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
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
    imageBytes?: Uint8Array | ArrayBuffer;
    paddingY?: number;
  }
) {
  const { text = '', imageBytes, paddingY = 20 } = opts;

  const pdfDoc = await PDFDocument.load(bytes);

  let image;
  if (imageBytes) {
    try {
      image = await pdfDoc.embedPng(imageBytes);
    } catch {
      image = await pdfDoc.embedJpg(imageBytes);
    }
  }

  for (const page of pdfDoc.getPages()) {
    const y = paddingY;
    let imgWidth = 0;

    if (image) {
      imgWidth = 60;
      const imgHeight = (60 * image.height) / image.width;

      page.drawImage(image, {
        x: 20,
        y,
        width: imgWidth,
        height: imgHeight
      });
    }

    if (text) {
      page.drawText(text, {
        x: image ? 20 + imgWidth + 10 : 20,
        y: y + 10,
        size: 10,
        color: rgb(0, 0, 0)
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

export async function hasSignature(bytes: Uint8Array | ArrayBuffer) {
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();

  const fields = form.getFields();

  for (const field of fields) {
    const type = field.constructor.name;

    // PDFSignature2 = signature field in RootCA.id, Privy, eMeterai, BCS, etc.
    if (type === "PDFSignature" || type === "PDFSignature2") {
      return true;
    }
  }

  return false;
}
