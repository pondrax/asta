// The PDF library is patched (see `patches/@libpdf%2Fcore@0.5.3.patch`):
// - it capped cross-reference-stream field widths at 6 bytes, while the spec
//   allows 8 and BSrE writes `/W [1 8 2]`; without the fix every signed
//   document fails to load.
// - signing always reset a signature field's `/P` and `/Rect` to an invisible
//   widget; the fix keeps a widget's geometry that was set up beforehand,
//   which is what makes `prepareVisibleSignature` survive signing.
import {
  PDF,
  StandardFonts,
  PdfArray,
  PdfDict,
  PdfName,
  PdfNumber,
  PdfRef,
  PdfStream,
  PdfString,
  measureText,
  ops,
  rgb,
  type CheckboxField,
  type DropdownField,
  type FontInput,
  type ListBoxField,
  type PDFImage,
  type PdfObject,
  type RadioField,
  type TextField
} from '@libpdf/core';

// ---------------------------------------------------------
// Internals
// ---------------------------------------------------------

/** The bytes of a document, copied so the caller's buffer is never touched. */
function toBytes(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // libpdf keeps the original buffer around (incremental saves append to it),
  // so hand it a copy instead of the caller's array.
  return view.slice();
}

/** Loads a document. */
function open(bytes: Uint8Array | ArrayBuffer): Promise<PDF> {
  return PDF.load(toBytes(bytes));
}

/**
 * Saves without disturbing signatures the document already carries.
 *
 * A full save rewrites every object, which changes the bytes those signatures
 * cover and breaks them. Documents that carry at least one signature are
 * therefore saved incrementally — that is what lets a signed document be
 * signed again.
 */
function savePdf(pdf: PDF): Promise<Uint8Array> {
  const signed =
    pdf.getForm()?.getSignatureFields().some((field) => field.isSigned()) ??
    false;
  return pdf.save(signed ? { incremental: true } : undefined);
}

/** Decodes a base64 payload into raw bytes. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.codePointAt(i) ?? 0;
  return bytes;
}

/**
 * Embeds an image, trying PNG first and falling back to JPEG.
 *
 * Returns null when the payload is neither, so the caller can decide whether
 * the image is optional (a signature) or required (the footer QR code).
 */
function embedImage(pdf: PDF, bytes: Uint8Array): PDFImage | null {
  try {
    return pdf.embedPng(bytes);
  } catch {
    try {
      return pdf.embedJpeg(bytes);
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------
// Load PDF
// ---------------------------------------------------------
export async function loadPdf(bytes: Uint8Array | ArrayBuffer) {
  return open(bytes);
}

// ---------------------------------------------------------
// Read all form fields
// ---------------------------------------------------------
export async function getAllFormFields(bytes: Uint8Array | ArrayBuffer) {
  const pdf = await open(bytes);
  const form = pdf.getForm();

  const output: Record<string, any> = {};
  if (!form) return output;

  for (const field of form.getFields()) {
    // Signature fields are read separately (see `getSignatures`) and are never
    // filled by the user.
    if (field.type === 'signature') continue;

    let value: any = null;
    let multiline = false;

    switch (field.type) {
      case 'text': {
        const text = field as TextField;
        value = text.getValue();
        multiline = text.isMultiline;
        break;
      }
      case 'checkbox':
        value = (field as CheckboxField).isChecked();
        break;
      case 'radio':
        value = (field as RadioField).getValue();
        break;
      case 'dropdown':
        value = (field as DropdownField).getValue();
        break;
      case 'listbox':
        value = (field as ListBoxField).getValue();
        break;
    }

    output[field.name] = { type: field.type, value, multiline };
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
  const pdf = await open(bytes);
  const form = pdf.getForm();
  if (!form) return savePdf(pdf);

  Object.entries(values).forEach(([name, value]) => {
    const field = form.getField(name);
    if (!field) return;

    try {
      switch (field.type) {
        // text input
        case 'text':
          if (typeof value === 'string') (field as TextField).setValue(value);
          break;

        // checkbox
        case 'checkbox':
          value
            ? (field as CheckboxField).check()
            : (field as CheckboxField).uncheck();
          break;

        // radio
        case 'radio':
          if (typeof value === 'string') (field as RadioField).setValue(value);
          break;

        // dropdown
        case 'dropdown':
          if (typeof value === 'string')
            (field as DropdownField).setValue(value);
          break;

        // option list
        case 'listbox':
          if (typeof value === 'string')
            (field as ListBoxField).setValue([value]);
          break;
      }
    } catch (err) {
      // A read-only field or an option that isn't in the list must not sink
      // the whole document — leave the field as it was.
      console.warn(`Failed to fill field ${name}.`, err);
    }
  });

  // Signature fields stay interactive: they are the point of the signing
  // flow, and flattening them would drop the signature we just read.
  form.flatten({ skipSignatures: true });
  return savePdf(pdf);
}

// ---------------------------------------------------------
// Draw footer (image + text)
// ---------------------------------------------------------
function wrapText(
  text: string,
  font: FontInput,
  size: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];

  // Break words wider than the line box so nothing overflows horizontally.
  const pushWord = (word: string): string => {
    let current = '';
    for (const ch of word) {
      if (current && measureText(current + ch, font, size) > maxWidth) {
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
      if (measureText(candidate, font, size) <= maxWidth) {
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

  const pdf = await open(bytes);
  const font = StandardFonts.Helvetica;

  let image = null;
  if (imageBase64) {
    image = embedImage(pdf, base64ToBytes(imageBase64));
    if (!image) throw new Error('Footer image is neither a PNG nor a JPEG.');
  }

  const pages = pdf.getPages();
  const targets =
    onlyPage && pages[onlyPage - 1] ? [pages[onlyPage - 1]] : pages;

  const marginX = 20;
  const gap = 10;
  const baseSize = 10;
  const baseImageSize = 32;

  for (const page of targets) {
    const y = paddingY;
    const { width: pageWidth } = page.getMediaBox();
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

  return savePdf(pdf);
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

  const pdf = await open(bytes);
  const pages = pdf.getPages();

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
    const pageNum = Number.parseInt(pageNumStr);
    const pageSignatures = signaturesByPage[pageNum];
    const page = pages[pageNum];
    const { height: pageHeight } = page.getMediaBox();

    for (const signature of pageSignatures) {
      const { imageBase64, originX, originY, width, height } = signature;

      const image = embedImage(pdf, base64ToBytes(imageBase64));
      if (!image) {
        console.warn(`Failed to embed image for signature ${signature.id}. Skipping.`);
        continue;
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

  return savePdf(pdf);
}

// ---------------------------------------------------------
// Draw mixed placements (signature image, text, date, checkbox)
//
// A generalisation of `drawImages` used by `/sign`. All placements share the
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

  const pdf = await open(bytes);
  const pages = pdf.getPages();
  const font = StandardFonts.Helvetica;

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
    const pageNum = Number.parseInt(pageNumStr);
    const page = pages[pageNum];
    const { height: pageHeight } = page.getMediaBox();

    for (const placement of byPage[pageNumStr]) {
      const kind = placement.kind || 'signature';
      const { originX, originY, width, height } = placement;
      // top-left (0,0) → bottom-left coordinate system
      const finalY = pageHeight - originY - height;

      if (kind === 'signature') {
        if (!placement.imageBase64) continue;
        const image = embedImage(pdf, base64ToBytes(placement.imageBase64));
        if (!image) {
          console.warn(
            `Failed to embed image for placement ${placement.id}. Skipping.`
          );
          continue;
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

  return savePdf(pdf);
}

// ---------------------------------------------------------
// Visible signature field
//
// Burned-in visuals are just page content: the digital signature stays
// invisible. For a *visible* signature the signer has to sign a widget that
// already carries a rectangle and an appearance stream, so the appearance is
// part of the signed content rather than something drawn next to it.
// ---------------------------------------------------------

export type VisibleSignature = {
  /** 1-indexed page number. */
  page: number;
  /** PDF points, top-left origin of the box, page-relative. */
  originX: number;
  /** PDF points, top edge of the box, from the page top. */
  originY: number;
  /** PDF points. */
  width: number;
  /** PDF points. */
  height: number;
  /** Base64 PNG or JPEG rendered as the signature appearance. */
  imageBase64: string;
};

export type PreparedSignature = {
  bytes: Uint8Array;
  /** The field the signer must sign; its widget is the visible appearance. */
  fieldName: string;
};

/** A field name that isn't taken yet. */
function uniqueFieldName(form: { getFieldNames(): string[] }): string {
  const taken = new Set(form.getFieldNames());
  if (!taken.has('Signature1')) return 'Signature1';
  for (let i = 2; ; i++) {
    const name = `Signature${i}`;
    if (!taken.has(name)) return name;
  }
}

/**
 * Turns a placed signature visual into a visible signature field.
 *
 * The field is a widget with a rectangle and a normal appearance stream, so a
 * viewer draws the signature where the user put it. The returned `fieldName`
 * is the field the signer must sign — signing it covers the appearance, which
 * is what keeps the visible signature tied to the signature itself.
 */
export async function prepareVisibleSignature(
  bytes: Uint8Array | ArrayBuffer,
  signature: VisibleSignature
): Promise<PreparedSignature> {
  const pdf = await open(bytes);
  const page = pdf.getPages()[signature.page - 1];
  if (!page) throw new Error(`Page ${signature.page} does not exist.`);

  const image = embedImage(pdf, base64ToBytes(signature.imageBase64));
  if (!image) throw new Error('Signature image is neither a PNG nor a JPEG.');

  const { width, height } = signature;

  // The appearance draws the image across the whole widget box.
  const appearance = pdf.createFormXObject({
    bbox: { x: 0, y: 0, width, height },
    operators: [
      ops.pushGraphicsState(),
      ops.concatMatrix(width, 0, 0, height, 0, 0),
      ops.paintXObject('Im0'),
      ops.popGraphicsState()
    ]
  });
  const stream = pdf.context.resolve(appearance.ref);
  if (stream instanceof PdfStream) {
    stream.set(
      'Resources',
      PdfDict.of({ XObject: PdfDict.of({ Im0: image.ref }) })
    );
  }

  const form = pdf.getOrCreateForm();
  const field = form.createSignatureField(uniqueFieldName(form));
  const fieldDict = field.getDict();
  const fieldRef = field.getRef();

  const { height: pageHeight } = page.getMediaBox();
  const bottom = pageHeight - signature.originY - height;

  // A field without /Kids is its own widget: annotate it directly.
  fieldDict.delete('Kids');
  fieldDict.set('Type', PdfName.of('Annot'));
  fieldDict.set('Subtype', PdfName.of('Widget'));
  fieldDict.set('F', PdfNumber.of(132)); // Print + Locked
  fieldDict.set('P', page.ref);
  fieldDict.set('Rect', new PdfArray([
    PdfNumber.of(signature.originX),
    PdfNumber.of(bottom),
    PdfNumber.of(signature.originX + width),
    PdfNumber.of(bottom + height)
  ]));
  fieldDict.set('AP', PdfDict.of({ N: appearance.ref }));

  // A widget that isn't listed on the page is never drawn.
  if (fieldRef) {
    const resolver = pdf.context.resolve.bind(pdf.context);
    const annots = page.dict.getArray('Annots', resolver);
    if (annots) {
      annots.push(fieldRef);
      page.dict.set('Annots', annots);
    } else {
      page.dict.set('Annots', new PdfArray([fieldRef]));
    }
  }

  return { bytes: await savePdf(pdf), fieldName: field.name };
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
  const pdf = await open(bytes);
  const form = pdf.getForm();
  if (!form) return false;

  return form.getSignatureFields().length > 0;
}

/** Names of the digital signature fields already present in the document. */
export type SignatureInfo = {
  /** Display label; the signer's name when the signature carries one. */
  name: string;
  /** Raw AcroForm field name, e.g. "Signature1". */
  fieldName?: string;
  /** Signature handler, e.g. "Adobe.PPKLite". */
  filter?: string;
  /** Encoding, e.g. "adbe.pkcs7.detached" (a cryptographic signature) or
   *  "adbe.x509.rsa_sha1". */
  subFilter?: string;
  /** Signing time, already formatted. */
  date?: string;
  /** Free-text reason the signer gave. */
  reason?: string;
  /** Free-text location the signer gave. */
  location?: string;
  /** Contact info recorded with the signature, when present. */
  contactInfo?: string;
  /** Full subject distinguished name, e.g.
   *  "CN=IKA PUSPITASARI, O=Pemerintah Kota Mojokerto, C=ID". */
  subjectName?: string;
  /** Common name (CN) from the signing certificate's subject. */
  signerCommonName?: string;
  /** Organisation (O) from the signing certificate's subject. */
  signerOrg?: string;
  /** Country (C) from the signing certificate's subject. */
  signerCountry?: string;
  /** Email address from the certificate's subject emailAddress attribute. */
  signerEmail?: string;
  /** Issuer distinguished name, e.g. "CN=BSRE CA DS G1, O=Badan Siber ...". */
  issuerName?: string;
  /** Issuer common name (who issued the signing certificate). */
  issuerCommonName?: string;
  /** Start of the signing certificate's validity window. */
  signerValidFrom?: string;
  /** End of the signing certificate's validity window. */
  signerValidTo?: string;
};

function toPdfString(obj: PdfObject | undefined): string | undefined {
  if (obj instanceof PdfString) {
    try {
      return obj.asString();
    } catch {
      return undefined;
    }
  }
  // /Filter and /SubFilter are PDFName objects ("/Adobe.PPKLite").
  if (obj instanceof PdfName) return obj.value;
  return undefined;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
];

/** "D:YYYYMMDDHHmmSS..." → "DD Mmm YYYY HH:mm". */
function formatPdfDate(value?: string): string | undefined {
  if (!value) return undefined;
  const m = /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(value);
  if (!m) return value;
  const [, Y, Mo, D, H = '00', Mi = '00'] = m;
  return `${D} ${MONTHS[Number(Mo) - 1] ?? Mo} ${Y} ${H}:${Mi}`;
}

/** ASN.1 UTCTime (0x17) / GeneralizedTime (0x18) → "DD Mmm YYYY HH:mm".
 *
 * The wall-clock time is kept as the certificate wrote it: a `Z` means UTC, a
 * numeric offset is left alone, exactly like the PDF's own signing date. */
function readAsn1Time(buf: Uint8Array, tlv: Tlv): string | undefined {
  try {
    const text = new TextDecoder('latin1')
      .decode(buf.slice(tlv.start, tlv.end))
      .trim();
    const m =
      tlv.tag === 0x17
        ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(\d{2})?/.exec(text)
        : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})?(\d{2})?/.exec(text);
    if (!m) return undefined;

    const year =
      tlv.tag === 0x17
        ? String(Number(m[1]) >= 50 ? 1900 + Number(m[1]) : 2000 + Number(m[1]))
        : m[1];
    const rest = m.slice(2).join('');
    const month = rest.slice(0, 2);
    const day = rest.slice(2, 4);
    const hour = rest.slice(4, 6) || '00';
    const minute = rest.slice(6, 8) || '00';
    if (!month || !day) return undefined;

    return `${day} ${MONTHS[Number(month) - 1] ?? month} ${year} ${hour}:${minute}`;
  } catch {
    return undefined;
  }
}

/** DN attribute OID *content* bytes (without the 06/len header), as readDn
 *  keys them: 2.5.4.3 commonName, 2.5.4.10 organizationName, 2.5.4.6
 *  countryName, 1.2.840.113549.1.9.1 emailAddress. */
const OID_CN = '55 04 03';
const OID_ORG = '55 04 0a';
const OID_COUNTRY = '55 04 06';
const OID_EMAIL = '2a 86 48 86 f7 0d 01 09 01';

type Tlv = { tag: number; start: number; end: number };

/** One ASN.1 tag-length-value header at `off`.
 *
 * BER allows an indefinite length (0x80), where the value runs until the
 * matching end-of-contents marker. Some signers — Peruri's meterai among
 * them — emit their PKCS#7 that way, so the walk has to understand it. */
function readTlv(buf: Uint8Array, off: number): Tlv {
  const tag = buf[off];
  let p = off + 1;
  let len = buf[p++];

  if (len === 0x80) {
    const start = p;
    // Skip over the children until the end-of-contents that closes this value.
    // `end` points past the marker, so it doubles as the next sibling's start.
    while (p < buf.length) {
      if (buf[p] === 0x00 && buf[p + 1] === 0x00) {
        return { tag, start, end: p + 2 };
      }
      const child = readTlv(buf, p);
      if (child.end <= p) break;
      p = child.end;
    }
    return { tag, start, end: p };
  }

  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let k = 0; k < n; k++) len = (len << 8) | (buf[p++] ?? 0);
  }
  return { tag, start: p, end: p + len };
}

/** The byte string of a DER value TLV, decoded to text. */
function tlvString(buf: Uint8Array, tlv: Tlv): string {
  try {
    return new TextDecoder(tlv.tag === 0x1e ? 'utf-16be' : 'utf-8')
      .decode(buf.slice(tlv.start, tlv.end))
      .trim();
  } catch {
    return '';
  }
}

/** Flatten a DN (SEQUENCE OF SET OF AttributeTypeAndValue) into oid→value. */
function readDn(
  buf: Uint8Array,
  start: number,
  end: number,
  out: Record<string, string>,
): void {
  let p = start;
  while (p < end) {
    const t = readTlv(buf, p);
    if (p >= t.end) break;
    if (t.tag === 0x31 || t.tag === 0x30) {
      readDn(buf, t.start, t.end, out);
    } else if (t.tag === 0x06) {
      // The attribute value is the sibling right after the OID.
      const val = readTlv(buf, t.end);
      if (val.tag === 0x0c || val.tag === 0x13 || val.tag === 0x14 || val.tag === 0x16 || val.tag === 0x1e) {
        const oid = Array.from(buf.slice(t.start, t.end))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ');
        out[oid] = tlvString(buf, val);
      }
    }
    p = t.end;
  }
}

/** "CN=…, O=…, C=…" from a DN's attribute map. */
function dnToString(dn: Record<string, string>): string | undefined {
  const parts: string[] = [];
  if (dn[OID_CN]) parts.push(`CN=${dn[OID_CN]}`);
  if (dn[OID_ORG]) parts.push(`O=${dn[OID_ORG]}`);
  if (dn[OID_COUNTRY]) parts.push(`C=${dn[OID_COUNTRY]}`);
  return parts.length ? parts.join(', ') : undefined;
}

/** One certificate's subject + issuer DNs and validity window, or null if the
 *  shape is off. */
function certDns(buf: Uint8Array, certStart: number) {
  try {
    const cert = readTlv(buf, certStart);
    const tbs = readTlv(buf, cert.start);
    let p = tbs.start;
    const first = readTlv(buf, p);
    if (first.tag === 0xa0) p = first.end; // optional [0] version
    p = readTlv(buf, p).end; // serial
    p = readTlv(buf, p).end; // signature algorithm
    const issuer = readTlv(buf, p);
    p = issuer.end;
    const validity = readTlv(buf, p); // SEQUENCE { notBefore, notAfter }
    p = validity.end;
    const subject = readTlv(buf, p);
    const iDn: Record<string, string> = {};
    const sDn: Record<string, string> = {};
    readDn(buf, issuer.start, issuer.end, iDn);
    readDn(buf, subject.start, subject.end, sDn);

    // validity: notBefore then notAfter
    let validFrom: string | undefined;
    let validTo: string | undefined;
    try {
      const notBefore = readTlv(buf, validity.start);
      const notAfter = readTlv(buf, notBefore.end);
      validFrom = readAsn1Time(buf, notBefore);
      validTo = readAsn1Time(buf, notAfter);
    } catch {
      /* the certificate has no readable validity window */
    }

    return { subject: sDn, issuer: iDn, validFrom, validTo };
  } catch {
    return null;
  }
}

/**
 * Subject + issuer of the signing certificate from a PKCS#7 `/Contents`.
 *
 * The blob is `ContentInfo → [0] SignedData`, whose `certificates` holds the
 * whole chain. BSrE orders it root-first (not leaf-first as the spec suggests),
 * so the signer is found structurally: the leaf is the certificate that no
 * other certificate in the set names as its issuer. When that is ambiguous the
 * signature's `/Name` is matched against a subject CN, and the last cert is the
 * final fallback (root-first ordering puts the signer last).
 */
function parseCertificate(der: Uint8Array, nameHint?: string) {
  try {
    const ci = readTlv(der, 0);
    let p = readTlv(der, ci.start).end; // contentType OID
    const wrapper = readTlv(der, p); // [0] EXPLICIT
    const signed = readTlv(der, wrapper.start);
    p = signed.start;
    p = readTlv(der, p).end; // version
    p = readTlv(der, p).end; // digestAlgorithms
    p = readTlv(der, p).end; // encapContentInfo
    const certs = readTlv(der, p); // [0] certificates
    if (certs.tag !== 0xa0) return {};

    const chain: {
      subject: Record<string, string>;
      issuer: Record<string, string>;
      validFrom?: string;
      validTo?: string;
    }[] = [];
    let q = certs.start;
    while (q < certs.end) {
      const cert = readTlv(der, q);
      if (cert.tag !== 0x30) break;
      const dns = certDns(der, q);
      if (dns) chain.push(dns);
      q = cert.end;
    }
    if (chain.length === 0) return {};

    const h = nameHint?.trim().toLowerCase();
    const issuerCns = new Set(
      chain.map((c) => c.issuer[OID_CN]).filter(Boolean),
    );
    // Leaf: its subject CN is not an issuer CN of any cert in the chain.
    let leaf = chain.find(
      (c) => c.subject[OID_CN] && !issuerCns.has(c.subject[OID_CN]),
    );
    if (!leaf && h) {
      leaf = chain.find((c) => c.subject[OID_CN]?.toLowerCase() === h);
    }
    if (!leaf) leaf = chain[chain.length - 1];

    const { subject, issuer, validFrom, validTo } = leaf;
    return {
      cn: subject[OID_CN],
      org: subject[OID_ORG],
      country: subject[OID_COUNTRY],
      email: subject[OID_EMAIL],
      subjectName: dnToString(subject),
      issuer: issuer[OID_CN],
      issuerName: dnToString(issuer),
      validFrom,
      validTo,
    };
  } catch {
    return {};
  }
}

/** The signature's `/Contents` as raw bytes. */
function sigContents(
  sigDict: PdfDict | undefined,
  resolve: (o: PdfObject | undefined) => PdfObject | undefined,
): Uint8Array | undefined {
  const raw = resolve(sigDict?.get('Contents'));
  if (raw instanceof PdfString) {
    try {
      return raw.bytes;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

type SignatureEntry = {
  fieldName: string;
  info: SignatureInfo;
  contents?: Uint8Array;
  byteRange?: number[];
  subFilter?: string;
  /** The document's DSS holds revocation/validation data for this signature. */
  ltvData?: boolean;
};

/** Parse `/DSS /VRI` into uppercase SHA-1 keys → validation data counts. */
function readDss(
  catalog: PdfDict,
  resolve: (o: PdfObject | undefined) => PdfObject | undefined,
): Map<string, boolean> | undefined {
  try {
    const dss = resolve(catalog.get('DSS'));
    if (!(dss instanceof PdfDict)) return undefined;
    const vri = resolve(dss.get('VRI'));
    if (!(vri instanceof PdfDict)) {
      // Older layouts keep the validation data at the DSS level only.
      return undefined;
    }
    const count = (dict: PdfDict, key: string) => {
      const value = resolve(dict.get(key));
      return value instanceof PdfArray ? value.length : 0;
    };
    const map = new Map<string, boolean>();
    for (const key of vri.keys()) {
      const dict = resolve(vri.get(key.value));
      if (!(dict instanceof PdfDict)) continue;
      const entries =
        count(dict, 'Cert') + count(dict, 'OCSP') + count(dict, 'CRL');
      map.set(key.value.toUpperCase(), entries > 0);
    }
    return map;
  } catch {
    return undefined;
  }
}

function sha1Hex(bytes: Uint8Array): Promise<string> {
  return crypto.subtle
    .digest('SHA-1', bytes as BufferSource)
    .then((digest) =>
      Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase(),
    );
}

async function readSignatureEntries(
  bytes: Uint8Array | ArrayBuffer,
): Promise<SignatureEntry[]> {
  const pdf = await open(bytes);
  const form = pdf.getForm();
  if (!form) return [];

  // Signature dictionaries live in the field's /V entry, which may be an
  // indirect reference.
  const resolve = (obj: PdfObject | undefined): PdfObject | undefined => {
    if (obj instanceof PdfRef) return pdf.context.resolve(obj) ?? undefined;
    return obj;
  };

  const vri = readDss(pdf.context.catalog.getDict(), resolve);

  const entries = form.getSignatureFields().map((field) => {
    const entry: SignatureEntry = {
      fieldName: field.name,
      info: { name: field.name, fieldName: field.name },
    };
    try {
      const sigDict = field.getSignatureDict();
      if (!sigDict) return entry;

      const info = entry.info;
      const read = (key: string) => toPdfString(resolve(sigDict.get(key)));
      const nameField = read('Name');
      info.name = nameField || info.name;
      info.reason = read('Reason');
      info.location = read('Location');
      info.contactInfo = read('ContactInfo');
      info.date = formatPdfDate(read('M'));
      info.filter = toPdfString(resolve(sigDict.get('Filter')));
      info.subFilter = toPdfString(resolve(sigDict.get('SubFilter')));
      entry.subFilter = info.subFilter;

      const range = resolve(sigDict.get('ByteRange'));
      if (range instanceof PdfArray) {
        const values: number[] = [];
        for (const item of range) {
          const resolved = resolve(item);
          if (resolved instanceof PdfNumber) values.push(resolved.value);
        }
        if (values.length === 4) entry.byteRange = values;
      }

      const contents = sigContents(sigDict, resolve);
      if (contents && contents.length > 0) {
        entry.contents = contents;
        const cert = parseCertificate(contents, nameField || undefined);
        info.subjectName = cert.subjectName;
        info.signerCommonName = cert.cn;
        info.signerOrg = cert.org;
        info.signerCountry = cert.country;
        info.signerEmail = cert.email;
        info.issuerName = cert.issuerName;
        info.issuerCommonName = cert.issuer;
        info.signerValidFrom = cert.validFrom;
        info.signerValidTo = cert.validTo;
        // The field name ("Signature1") is meaningless to a reader; prefer
        // the certificate's common name as the signer's label.
        if (!nameField && cert.cn) info.name = cert.cn;
      }
    } catch {
      /* best-effort: keep the field name */
    }
    return entry;
  });

  if (vri) {
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.contents) return;
        try {
          // PAdES keys the VRI by the SHA-1 of the DER blob in /Contents,
          // not the zero-padded field value.
          const der = entry.contents.subarray(0, readTlv(entry.contents, 0).end);
          const key = await sha1Hex(der);
          if (vri.has(key)) entry.ltvData = vri.get(key);
        } catch {
          /* ignore a malformed blob */
        }
      }),
    );
  }

  return entries;
}

export async function getSignatures(
  bytes: Uint8Array | ArrayBuffer
): Promise<SignatureInfo[]> {
  return (await readSignatureEntries(bytes)).map((entry) => entry.info);
}

// ---------------------------------------------------------
// Local signature verification (WebCrypto)
// ---------------------------------------------------------

export type SignatureVerification = {
  fieldName: string;
  signerName?: string;
  /** The signed bytes hash to the digest in the CMS and the signature checks
   *  out against the signer's certificate. */
  integrityValid: boolean;
  /** Every certificate in the chain was signed by its issuer and the update
   *  ends at a self-signed root. */
  chainValid: boolean;
  /** The chain reaches a known Indonesian trust anchor (BSrE/Kominfo). */
  certificateTrusted: boolean;
  /** Long-term validation data (DSS/VRI) is embedded for this signature. */
  ltv: boolean;
  /** The signature carries a signature timestamp token. */
  timestamped: boolean;
  digestAlgorithm?: string;
  signatureAlgorithm?: string;
  notBefore?: string;
  notAfter?: string;
  signingTime?: string;
  error?: string;
};

const DIGEST_OIDS: Record<string, string> = {
  '1.3.14.3.2.26': 'SHA-1',
  '2.16.840.1.101.3.4.2.1': 'SHA-256',
  '2.16.840.1.101.3.4.2.2': 'SHA-384',
  '2.16.840.1.101.3.4.2.3': 'SHA-512',
};

const SIGNATURE_OIDS: Record<string, { hash: string; kind: 'rsa' | 'ecdsa' | 'pss' }> = {
  '1.2.840.113549.1.1.5': { hash: 'SHA-1', kind: 'rsa' },
  '1.2.840.113549.1.1.11': { hash: 'SHA-256', kind: 'rsa' },
  '1.2.840.113549.1.1.12': { hash: 'SHA-384', kind: 'rsa' },
  '1.2.840.113549.1.1.13': { hash: 'SHA-512', kind: 'rsa' },
  '1.2.840.113549.1.1.1': { hash: '', kind: 'rsa' },
  '1.2.840.113549.1.1.10': { hash: '', kind: 'pss' },
  '1.2.840.10045.4.3.2': { hash: 'SHA-256', kind: 'ecdsa' },
  '1.2.840.10045.4.3.3': { hash: 'SHA-384', kind: 'ecdsa' },
  '1.2.840.10045.4.3.4': { hash: 'SHA-512', kind: 'ecdsa' },
};

const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_SIGNING_TIME = '1.2.840.113549.1.9.5';
const OID_TIMESTAMP_TOKEN = '1.2.840.113549.1.9.16.2.14';

function readOid(buf: Uint8Array, tlv: Tlv): string {
  const bytes = buf.subarray(tlv.start, tlv.end);
  if (bytes.length === 0) return '';
  const parts = [Math.floor(bytes[0] / 40), bytes[0] % 40];
  let value = 0;
  for (let i = 1; i < bytes.length; i++) {
    value = (value << 7) | (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join('.');
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const HASH_LENGTH: Record<string, number> = {
  'SHA-1': 20,
  'SHA-256': 32,
  'SHA-384': 48,
  'SHA-512': 64,
};

/** Verify `signature` over `data` with the certificate's SubjectPublicKeyInfo.
 *  Tries the three WebCrypto schemes so RSA-PSS/ECDSA chains also work. */
async function verifyCrypto(
  spki: Uint8Array,
  signature: Uint8Array,
  data: Uint8Array,
  hash: string,
): Promise<boolean> {
  if (!hash) return false;
  const algorithms: { import: RsaHashedImportParams | EcKeyImportParams; verify: AlgorithmIdentifier | RsaPssParams | EcdsaParams }[] = [
    {
      import: { name: 'RSASSA-PKCS1-v1_5', hash },
      verify: { name: 'RSASSA-PKCS1-v1_5' },
    },
    {
      import: { name: 'ECDSA', namedCurve: 'P-256' },
      verify: { name: 'ECDSA', hash },
    },
    {
      import: { name: 'RSA-PSS', hash },
      verify: { name: 'RSA-PSS', saltLength: HASH_LENGTH[hash] ?? 32 },
    },
  ];
  for (const algorithm of algorithms) {
    try {
      const key = await crypto.subtle.importKey(
        'spki',
        spki as BufferSource,
        algorithm.import as AlgorithmIdentifier,
        false,
        ['verify'],
      );
      if (
        await crypto.subtle.verify(
          algorithm.verify,
          key,
          signature as BufferSource,
          data as BufferSource,
        )
      ) {
        return true;
      }
    } catch {
      /* key/algorithm mismatch — try the next scheme */
    }
  }
  return false;
}

type CertInfo = {
  der: Uint8Array;
  spki: Uint8Array;
  tbs: Uint8Array;
  signature: Uint8Array;
  signatureOid: string;
  subject: Record<string, string>;
  issuer: Record<string, string>;
  subjectName?: string;
  issuerName?: string;
  validFrom?: string;
  validTo?: string;
  selfSigned: boolean;
};

function parseCert(der: Uint8Array): CertInfo | undefined {
  try {
    const cert = readTlv(der, 0);
    let p = cert.start;
    const tbs = readTlv(der, p);
    const tbsDer = der.slice(p, tbs.end);
    p = tbs.end;
    const sigAlg = readTlv(der, p);
    const sigAlgOid = readOid(der, readTlv(der, sigAlg.start));
    p = sigAlg.end;
    const sigValue = readTlv(der, p);

    let q = tbs.start;
    let t = readTlv(der, q);
    if (t.tag === 0xa0) {
      q = t.end;
      t = readTlv(der, q);
    }
    q = t.end; // serial
    q = readTlv(der, q).end; // signature algorithm
    const issuer = readTlv(der, q);
    q = issuer.end;
    const validity = readTlv(der, q);
    q = validity.end;
    const subject = readTlv(der, q);
    q = subject.end;
    const spki = readTlv(der, q);
    const spkiDer = der.slice(q, spki.end);

    const issuerDn: Record<string, string> = {};
    const subjectDn: Record<string, string> = {};
    readDn(der, issuer.start, issuer.end, issuerDn);
    readDn(der, subject.start, subject.end, subjectDn);

    let validFrom: string | undefined;
    let validTo: string | undefined;
    try {
      const notBefore = readTlv(der, validity.start);
      const notAfter = readTlv(der, notBefore.end);
      validFrom = readAsn1Time(der, notBefore);
      validTo = readAsn1Time(der, notAfter);
    } catch {
      /* no readable validity window */
    }

    return {
      der,
      spki: spkiDer,
      tbs: tbsDer,
      signature: der.slice(
        sigValue.tag === 0x03 ? sigValue.start + 1 : sigValue.start,
        sigValue.end,
      ),
      signatureOid: sigAlgOid,
      subject: subjectDn,
      issuer: issuerDn,
      subjectName: dnToString(subjectDn),
      issuerName: dnToString(issuerDn),
      validFrom,
      validTo,
      selfSigned: dnToString(subjectDn) === dnToString(issuerDn),
    };
  } catch {
    return undefined;
  }
}

/** All certificates in the CMS `/Contents`, in the order they were stored. */
function parseCertificates(der: Uint8Array): CertInfo[] {
  try {
    const ci = readTlv(der, 0);
    let p = readTlv(der, ci.start).end; // contentType
    const wrapper = readTlv(der, p); // [0] EXPLICIT
    const signed = readTlv(der, wrapper.start);
    let q = signed.start;
    q = readTlv(der, q).end; // version
    q = readTlv(der, q).end; // digestAlgorithms
    q = readTlv(der, q).end; // encapContentInfo
    const certs = readTlv(der, q);
    if (certs.tag !== 0xa0) return [];
    const out: CertInfo[] = [];
    let off = certs.start;
    while (off < certs.end) {
      const t = readTlv(der, off);
      if (t.tag !== 0x30) break;
      const info = parseCert(der.slice(off, t.end));
      if (info) out.push(info);
      off = t.end;
    }
    return out;
  } catch {
    return [];
  }
}

type SignerInfo = {
  digestOid: string;
  signatureOid: string;
  signature: Uint8Array;
  signedAttrs?: { bytes: Uint8Array; tlv: Tlv };
  messageDigest?: Uint8Array;
  signingTime?: string;
  timestamped?: boolean;
};

function parseSignerInfo(der: Uint8Array, signed: Tlv): SignerInfo[] {
  // Find the signerInfos SET (the last 0x31 at SignedData level).
  let signerSet: Tlv | undefined;
  let p = signed.start;
  p = readTlv(der, p).end; // version
  p = readTlv(der, p).end; // digestAlgorithms
  p = readTlv(der, p).end; // encapContentInfo
  while (p < signed.end) {
    const t = readTlv(der, p);
    if (t.tag === 0x31) signerSet = t;
    p = t.end;
  }
  if (!signerSet) return [];

  const out: SignerInfo[] = [];
  let off = signerSet.start;
  while (off < signerSet.end) {
    const si = readTlv(der, off);
    off = si.end;
    if (si.tag !== 0x30) continue;

    let q = si.start;
    q = readTlv(der, q).end; // version
    q = readTlv(der, q).end; // sid
    const digestAlg = readTlv(der, q);
    q = digestAlg.end;
    let t = readTlv(der, q);
    let attrs: { bytes: Uint8Array; tlv: Tlv } | undefined;
    if (t.tag === 0xa0) {
      const tagOffset = q;
      const bytes = der.slice(tagOffset, t.end);
      bytes[0] = 0x31; // re-tag IMPLICIT [0] → SET OF, as signed
      attrs = { bytes, tlv: t };
      q = t.end;
      t = readTlv(der, q);
    }
    const sigAlg = t;
    q = sigAlg.end;
    const sigValue = readTlv(der, q);

    const signer: SignerInfo = {
      digestOid: readOid(der, readTlv(der, digestAlg.start)),
      signatureOid: readOid(der, readTlv(der, sigAlg.start)),
      signature: der.slice(sigValue.start, sigValue.end),
      signedAttrs: attrs,
    };

    if (attrs) {
      let a = attrs.tlv.start;
      while (a < attrs.tlv.end) {
        const attr = readTlv(der, a);
        if (attr.tag !== 0x30) {
          a = attr.end;
          continue;
        }
        const attrOid = readOid(der, readTlv(der, attr.start));
        const set = readTlv(der, readTlv(der, attr.start).end);
        const value = readTlv(der, set.start);
        if (attrOid === OID_MESSAGE_DIGEST) {
          signer.messageDigest = der.slice(value.start, value.end);
        } else if (attrOid === OID_SIGNING_TIME) {
          signer.signingTime = readAsn1Time(der, value);
        }
        a = attr.end;
      }
    }

    // Unsigned attributes follow the signature value; a timestamp token
    // among them is what makes LTV meaningful.
    let u = sigValue.end;
    if (u < si.end) {
      const unsigned = readTlv(der, u);
      if (unsigned.tag === 0xa1) {
        let a = unsigned.start;
        while (a < unsigned.end) {
          const attr = readTlv(der, a);
          if (attr.tag !== 0x30) {
            a = attr.end;
            continue;
          }
          const attrOid = readOid(der, readTlv(der, attr.start));
          if (attrOid === OID_TIMESTAMP_TOKEN) signer.timestamped = true;
          a = attr.end;
        }
      }
    }

    out.push(signer);
  }
  return out;
}

async function verifyChain(leaf: CertInfo, certs: CertInfo[]) {
  let current = leaf;
  const used = new Set<CertInfo>([leaf]);
  let links = true;
  for (let depth = 0; depth < 10; depth++) {
    if (current.selfSigned) {
      const anchor = current.subjectName?.toLowerCase() ?? '';
      const trusted =
        anchor.includes('root ca indonesia') || anchor.includes('bsre');
      const selfOk = await verifyCrypto(
        current.spki,
        current.signature,
        current.tbs,
        SIGNATURE_OIDS[current.signatureOid]?.hash || 'SHA-256',
      );
      return {
        valid: links && selfOk,
        trusted: links && selfOk && trusted,
      };
    }
    const issuer = certs.find(
      (c) => c !== current && !used.has(c) && c.subjectName === current.issuerName,
    );
    if (!issuer) return { valid: false, trusted: false };
    used.add(issuer);
    const hash =
      SIGNATURE_OIDS[current.signatureOid]?.hash ||
      SIGNATURE_OIDS[issuer.signatureOid]?.hash ||
      'SHA-256';
    const ok = await verifyCrypto(
      issuer.spki,
      current.signature,
      current.tbs,
      hash,
    );
    if (!ok) links = false;
    current = issuer;
  }
  return { valid: false, trusted: false };
}

async function verifyEntry(
  buf: Uint8Array,
  entry: SignatureEntry,
): Promise<SignatureVerification> {
  const result: SignatureVerification = {
    fieldName: entry.fieldName,
    signerName: entry.info.name,
    integrityValid: false,
    chainValid: false,
    certificateTrusted: false,
    ltv: entry.ltvData === true,
    timestamped: false,
    digestAlgorithm: undefined,
    signatureAlgorithm: undefined,
    notBefore: entry.info.signerValidFrom,
    notAfter: entry.info.signerValidTo,
  };

  if (!entry.contents || entry.contents.length === 0) {
    result.error = "Tanda tangan tidak memiliki data CMS.";
    return result;
  }
  if (!entry.byteRange) {
    result.error = "ByteRange tanda tangan tidak ditemukan.";
    return result;
  }
  // adbe.pkcs7.detached and ETSI.CAdES.detached both carry a CMS blob;
  // adbe.x509.rsa_sha1 stores a bare PKCS#1 signature and needs another path.
  if (entry.subFilter?.toLowerCase().includes('x509.rsa_sha1')) {
    result.error = `Format ${entry.subFilter} belum didukung untuk verifikasi lokal.`;
    return result;
  }

  try {
    const [a, b, c, d] = entry.byteRange;
    if (a + b > buf.length || c + d > buf.length) {
      result.error = "ByteRange melewati akhir berkas.";
      return result;
    }
    const signedBytes = new Uint8Array(b + d);
    signedBytes.set(buf.subarray(a, a + b), 0);
    signedBytes.set(buf.subarray(c, c + d), b);

    const der = entry.contents;
    const ci = readTlv(der, 0);
    let p = readTlv(der, ci.start).end;
    const wrapper = readTlv(der, p);
    const signed = readTlv(der, wrapper.start);

    const signers = parseSignerInfo(der, signed);
    if (signers.length === 0) {
      result.error = "SignerInfo tidak ditemukan di dalam CMS.";
      return result;
    }
    const signer = signers[0];
    const digestName = DIGEST_OIDS[signer.digestOid] ?? 'SHA-256';
    result.digestAlgorithm = digestName;
    const sigInfo = SIGNATURE_OIDS[signer.signatureOid];
    result.signatureAlgorithm =
      sigInfo?.kind === 'ecdsa' ? 'ECDSA' : sigInfo?.kind === 'pss' ? 'RSA-PSS' : 'RSA';

    const docDigest = new Uint8Array(
      await crypto.subtle.digest(digestName, signedBytes as BufferSource),
    );

    let digestOk = true;
    if (signer.signedAttrs) {
      digestOk =
        !!signer.messageDigest && equalBytes(signer.messageDigest, docDigest);
      if (signer.signingTime) result.signingTime = signer.signingTime;
    }

    const certs = parseCertificates(der);
    const data = signer.signedAttrs?.bytes ?? signedBytes;

    let signatureOk = false;
    let signerCert: CertInfo | undefined;
    for (const cert of certs) {
      signatureOk = await verifyCrypto(
        cert.spki,
        signer.signature,
        data,
        digestName,
      );
      if (signatureOk) {
        signerCert = cert;
        break;
      }
    }

    result.integrityValid = digestOk && signatureOk;
    result.timestamped = !!signer.timestamped;

    if (signerCert) {
      const chain = await verifyChain(signerCert, certs);
      result.chainValid = chain.valid;
      result.certificateTrusted = chain.trusted;
    } else if (!signatureOk) {
      result.error = "Signature tidak cocok dengan sertifikat mana pun.";
    }

    return result;
  } catch (err) {
    result.error =
      err instanceof Error ? err.message : "Verifikasi lokal gagal.";
    return result;
  }
}

/**
 * Verify every signature in a PDF locally, without calling the e-sign service.
 *
 * Checks the CMS `messageDigest` against the bytes the signature covers, the
 * signature against the signer's certificate, and walks the embedded chain to
 * a self-signed root.
 */
export async function verifySignatures(
  bytes: Uint8Array | ArrayBuffer,
): Promise<SignatureVerification[]> {
  const buf = toBytes(bytes);
  const entries = await readSignatureEntries(buf);
  return Promise.all(entries.map((entry) => verifyEntry(buf, entry)));
}


export async function isEncrypted(bytes: Uint8Array | ArrayBuffer): Promise<boolean> {
  try {
    const pdf = await open(bytes);
    return pdf.isEncrypted;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------
// Text extraction
// ---------------------------------------------------------

/**
 * The document's text layer, page by page.
 *
 * The signing workspace has no editor, so "summarise this document" has to
 * read the file itself. A page with no text layer — a scan — contributes
 * nothing, which is the honest answer rather than an error.
 *
 * `maxChars` caps the result: the whole point is to hand it to a model, and a
 * hundred-page contract would blow the context window for no benefit.
 */
export async function extractText(
  bytes: Uint8Array | ArrayBuffer,
  maxChars = 20000,
): Promise<string> {
  const pdf = await open(bytes);
  const pages = pdf.extractText();

  const chunks: string[] = [];
  let total = 0;
  for (const page of pages) {
    const text = page.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    chunks.push(text);
    total += text.length;
    if (total >= maxChars) break;
  }

  return chunks.join('\n\n').slice(0, maxChars);
}
