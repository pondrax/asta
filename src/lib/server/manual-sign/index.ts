import { PDF, P12Signer } from '@libpdf/core';
import fs from 'fs';
import path from 'path';

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
    fieldName: options.fieldName || 'Signature1',
    subFilter: 'adbe.pkcs7.detached'
  });

  return Buffer.from(result.bytes).toString('base64');
}
