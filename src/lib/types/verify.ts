/**
 * Shape of the BSrE/BSSN verification service response
 * (`POST /api/v2/verify/pdf`).
 *
 * Dates arrive as Unix epoch milliseconds; `number | string` keeps call sites
 * tolerant of a service that switches to ISO strings.
 */
export type VerifyDate = number | string;

export type SignatureVerificationResponse = {
  /** Non-fatal notices, e.g. deprecated algorithm warnings. */
  warning?: string[];
  conclusion: "VALID" | "INVALID" | string;
  description: string;
  signatureCount: number;
  signatureInformations: SignatureInformation[];
};

export type SignatureInformation = {
  id: string;
  /** Field name in the PDF, e.g. "Signature1". */
  fieldName: string;
  signerName: string;
  /** Signing time. */
  signatureDate: VerifyDate;
  reason: string | null;
  location: string | null;
  /** e.g. "PAdES-BASELINE-T", "PAdES-BASELINE-LT". */
  signatureFormat: string;
  certLevelCode: number;
  signatureAlgorithm: string | null;
  digestAlgorithm: string | null;
  timestampInfomation: TimestampInformation;
  /** Leaf certificate first, then the issuing chain. */
  certificateDetails: CertificateDetail[];
  integrityValid: boolean;
  certificateTrusted: boolean;
  lastSignature: boolean;
  /** Long-term validation data present. */
  ltv: boolean;
  /** Document changed after this signature was applied. */
  modified: boolean;
};

export type TimestampInformation = {
  id: string;
  signerName: string;
  timestampDate: VerifyDate;
};

export type CertificateDetail = {
  id: string;
  issuerName: string;
  notBeforeDate: VerifyDate;
  notAfterDate: VerifyDate;
  /** The service spells this key "signatureAlgoritm". */
  signatureAlgoritm: string;
  keyUsages: string[];
  commonName: string;
  serialNumber: string;
};
