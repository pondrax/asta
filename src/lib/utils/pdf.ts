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
  /** Field name; the signer's display name when the signature carries one. */
  name: string;
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
};

function toPdfString(obj: unknown): string | undefined {
  if (obj instanceof PDFString || obj instanceof PDFHexString) {
    try {
      return obj.decodeText();
    } catch {
      return undefined;
    }
  }
  // /Filter and /SubFilter are PDFName objects ("/Adobe.PPKLite").
  if (obj instanceof PDFName) return obj.asString().replace(/^\//, '');
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

/** DN attribute OID *content* bytes (without the 06/len header), as readDn
 *  keys them: 2.5.4.3 commonName, 2.5.4.10 organizationName, 2.5.4.6
 *  countryName, 1.2.840.113549.1.9.1 emailAddress. */
const OID_CN = '55 04 03';
const OID_ORG = '55 04 0a';
const OID_COUNTRY = '55 04 06';
const OID_EMAIL = '2a 86 48 86 f7 0d 01 09 01';

type Tlv = { tag: number; start: number; end: number };

/** One ASN.1 tag-length-value header at `off`. */
function readTlv(buf: Uint8Array, off: number): Tlv {
  const tag = buf[off];
  let p = off + 1;
  let len = buf[p++];
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

/** One certificate's subject + issuer DNs, or null if the shape is off. */
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
    p = readTlv(buf, p).end; // validity
    const subject = readTlv(buf, p);
    const iDn: Record<string, string> = {};
    const sDn: Record<string, string> = {};
    readDn(buf, issuer.start, issuer.end, iDn);
    readDn(buf, subject.start, subject.end, sDn);
    return { subject: sDn, issuer: iDn };
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

    const chain: { subject: Record<string, string>; issuer: Record<string, string> }[] = [];
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

    const { subject, issuer } = leaf;
    return {
      cn: subject[OID_CN],
      org: subject[OID_ORG],
      country: subject[OID_COUNTRY],
      email: subject[OID_EMAIL],
      subjectName: dnToString(subject),
      issuer: issuer[OID_CN],
      issuerName: dnToString(issuer),
    };
  } catch {
    return {};
  }
}

/** The signature's `/Contents` as raw bytes (hex string or literal). */
function sigContents(
  sigDict: PDFDict | undefined,
  resolve: (o: unknown) => unknown,
): Uint8Array | undefined {
  const raw = resolve(sigDict?.get(PDFName.of('Contents')));
  if (raw instanceof PDFHexString) {
    try {
      return raw.asBytes();
    } catch {
      return undefined;
    }
  }
  if (raw instanceof PDFString) {
    try {
      return raw.asBytes();
    } catch {
      return undefined;
    }
  }
  return undefined;
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
        const nameField = read('Name');
        info.name = nameField || info.name;
        info.reason = read('Reason');
        info.location = read('Location');
        info.contactInfo = read('ContactInfo');
        info.date = formatPdfDate(read('M'));
        info.filter = toPdfString(resolve(sigDict?.get(PDFName.of('Filter'))));
        info.subFilter = toPdfString(
          resolve(sigDict?.get(PDFName.of('SubFilter'))),
        );
        const contents = sigContents(sigDict, resolve);
        if (contents && contents.length > 0) {
          const cert = parseCertificate(contents, nameField || undefined);
          info.subjectName = cert.subjectName;
          info.signerCommonName = cert.cn;
          info.signerOrg = cert.org;
          info.signerCountry = cert.country;
          info.signerEmail = cert.email;
          info.issuerName = cert.issuerName;
          info.issuerCommonName = cert.issuer;
          // The field name ("Signature1") is meaningless to a reader; prefer
          // the certificate's common name as the signer's label.
          if (!nameField && cert.cn) info.name = cert.cn;
        }
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

// ---------------------------------------------------------
// Text extraction (pdf.js)
// ---------------------------------------------------------
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

/**
 * Loads pdf.js once per session with its worker wired up.
 *
 * Kept separate from the copy `preview.svelte` parks on `window`, because text
 * extraction has to work whether or not a preview has been rendered yet.
 */
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

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
  const pdfjs = await loadPdfjs();
  // pdf.js takes ownership of the buffer it is handed, and the caller's bytes
  // are still needed for preview and signing, so give it a copy.
  const data = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0));
  const task = pdfjs.getDocument({ data });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    let total = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) {
        pages.push(text);
        total += text.length;
      }
      if (total >= maxChars) break;
    }
    return pages.join('\n\n').slice(0, maxChars);
  } finally {
    // pdfjs-dist v4+ destroys the document through the loading task.
    try {
      await task.destroy();
    } catch {
      /* teardown is best-effort */
    }
  }
}