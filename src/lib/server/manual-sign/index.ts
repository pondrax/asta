import { PDF, P12Signer } from '@libpdf/core';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import forge from 'node-forge';
import { prepareVisibleSignature } from '$lib/utils/pdf';

function ensureRootIdCert() {
  try {
    const rootIdPath = path.resolve(process.cwd(), 'certificates/rootid.crt');
    if (!fs.existsSync(rootIdPath)) {
      const keys = forge.pki.rsa.generateKeyPair(2048);
      const cert = forge.pki.createCertificate();
      cert.publicKey = keys.publicKey;
      cert.serialNumber = '01';
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 20);
      cert.setSubject([
        { name: 'commonName', value: 'Root CA Indonesia' },
        { name: 'organizationName', value: 'Kementerian Komunikasi dan Informatika' },
        { name: 'countryName', value: 'ID' }
      ]);
      cert.setIssuer([
        { name: 'commonName', value: 'Root CA Indonesia' },
        { name: 'organizationName', value: 'Kementerian Komunikasi dan Informatika' },
        { name: 'countryName', value: 'ID' }
      ]);
      cert.sign(keys.privateKey, forge.md.sha256.create());
      fs.writeFileSync(rootIdPath, forge.pki.certificateToPem(cert));
    }
  } catch {}
}
ensureRootIdCert();

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

function generateSignerP12(email: string): { p12: Buffer; password: string } {
  const password = crypto.randomBytes(16).toString('hex');
  const rootCrt = path.resolve(process.cwd(), 'certificates/rootmojokerto.crt');
  const rootKey = path.resolve(process.cwd(), 'certificates/rootmojokerto.key');
  const rootCrtPem = fs.readFileSync(rootCrt, 'utf8');
  const rootKeyPem = fs.readFileSync(rootKey, 'utf8');

  const rootCert = forge.pki.certificateFromPem(rootCrtPem);
  const rootPrivateKey = forge.pki.privateKeyFromPem(rootKeyPem);

  // Generate 2048-bit RSA key pair for signer
  const keys = forge.pki.rsa.generateKeyPair(2048);

  // Create certificate
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01' + crypto.randomBytes(16).toString('hex');
  
  const notBefore = new Date();
  const notAfter = new Date();
  notAfter.setFullYear(notBefore.getFullYear() + 5); // 5 years expiration
  cert.validity.notBefore = notBefore;
  cert.validity.notAfter = notAfter;

  const attrs = [{
    name: 'commonName',
    value: email || 'signer@mojokertokota.go.id'
  }, {
    name: 'organizationName',
    value: 'Pemerintah Kota Mojokerto'
  }, {
    name: 'countryName',
    value: 'ID'
  }];
  cert.setSubject(attrs);
  cert.setIssuer(rootCert.subject.attributes);

  // Sign certificate with root private key
  cert.sign(rootPrivateKey, forge.md.sha256.create());

  // Convert to PKCS#12 (.p12)
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
    keys.privateKey,
    [cert, rootCert],
    password,
    { algorithm: '3des' }
  );

  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  const p12 = Buffer.from(p12Der, 'binary');

  return { p12, password };
}

export async function signPdfManually(fileBase64: string, options: {
  reason?: string;
  location?: string;
  contactInfo?: string;
  fieldName?: string;
  signatureProperties?: any[];
}) {
  const pdfBytes = Buffer.from(fileBase64, 'base64');
  const pdf = await PDF.load(new Uint8Array(pdfBytes));

  const existingSigFields = pdf.getForm()?.getSignatureFields() || [];
  const unsignedField = existingSigFields.find((f) => !f.isSigned());

  let fieldName = options.fieldName;
  if (!fieldName) {
    if (unsignedField) {
      fieldName = unsignedField.name;
    } else {
      const sigProp = options.signatureProperties?.find((p: any) => (p.kind ?? 'signature') === 'signature');
      if (sigProp && sigProp.imageBase64 && existingSigFields.length === 0) {
        fieldName = (await prepareVisibleSignature(pdf, {
          page: sigProp.page || 1,
          originX: sigProp.originX || 0,
          originY: sigProp.originY || 0,
          width: sigProp.width || 200,
          height: sigProp.height || 100,
          imageBase64: sigProp.imageBase64,
        })) as string;
      } else {
        fieldName = 'Signature1';
      }
    }
  }

  const email = options.contactInfo || 'signer@mojokertokota.go.id';
  const { p12, password } = generateSignerP12(email);
  const signer = await P12Signer.create(p12, password);

  const result = await pdf.sign({
    signer,
    reason: options.reason || 'Tanda Tangan Elektronik',
    location: options.location || '-',
    contactInfo: email,
    fieldName: resolveFieldName(pdf, fieldName),
    subFilter: 'adbe.pkcs7.detached'
  });

  return Buffer.from(result.bytes).toString('base64');
}
