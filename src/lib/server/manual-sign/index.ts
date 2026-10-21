import { PDF, P12Signer } from '@libpdf/core';
import fs from 'fs';
import path from 'path';

/**
 * The field to sign.
 *
 * A prepared (still unsigned) field must be used as-is — its widget carries
 * the visible appearance. When the requested name already holds a signature
 * we're adding a second one, so fall back to the next free "SignatureN".
 */
function resolveFieldName(pdf: PDF, preferred: string): string {
  const form = pdf.getForm();
  if (!form) return preferred;

  const existing = form.getField(preferred);
  const signed =
    existing?.type === 'signature' &&
    form.getSignatureField(preferred)?.isSigned();

  if (!signed) return preferred;

  const taken = new Set(form.getFieldNames());
  for (let i = 1; ; i++) {
    const name = `Signature${i}`;
    if (!taken.has(name)) return name;
  }
}

export async function signPdfManually(fileBase64: string, options: {
  reason?: string;
  location?: string;
  contactInfo?: string;
  fieldName?: string;
}) {
  const pdfBytes = Buffer.from(fileBase64, 'base64');
  const pdf = await PDF.load(new Uint8Array(pdfBytes));

  const p12Path = path.resolve(process.cwd(), 'certificates/signer.p12');
  const p12 = fs.readFileSync(p12Path);
  const signer = await P12Signer.create(p12, '123456');

  const result = await pdf.sign({
    signer,
    reason: options.reason || 'Tanda Tangan Elektronik',
    location: options.location || '-',
    contactInfo: options.contactInfo || '',
    fieldName: resolveFieldName(pdf, options.fieldName || 'Signature1'),
    subFilter: 'adbe.pkcs7.detached'
  });

  return Buffer.from(result.bytes).toString('base64');
}
