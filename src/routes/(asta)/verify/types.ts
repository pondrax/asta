export type SignatureVerificationResponse = {
  warning?: string[]; // New optional field
  conclusion: "VALID" | "INVALID" | string;
  description: string;
  signatureInformations: SignatureInformation[];
  signatureCount: number;
};

type SignatureInformation = {
  // Order matches your base structure
  id: string;
  signatureFormat: string;
  signerName: string;
  signatureDate: string; // ISO 8601 date string
  fieldName: string;
  reason: string | null;
  location: string | null;
  certLevelCode: number;
  signatureAlgorithm: string | null;
  digestAlgorithm: string | null;
  timestampInfomation: TimestampInformation;
  certificateDetails: CertificateDetail[];
  integrityValid: boolean;
  certificateTrusted: boolean;
  lastSignature: boolean;
  // New fields from updated JSON
  ltv?: boolean;
  modified?: boolean;
};

type TimestampInformation = {
  id: string;
  signerName: string;
  timestampDate: string; // ISO 8601 date string
};

type CertificateDetail = {
  // Updated order to match new JSON
  id: string;
  issuerName: string;
  notBeforeDate: string; // ISO 8601 date string
  notAfterDate: string; // ISO 8601 date string
  signatureAlgoritm: string;
  keyUsages: string[];
  commonName: string;
  serialNumber: string;
};

// Alternative interface versions
interface ISignatureVerificationResponse {
  warning?: string[];
  conclusion: string;
  description: string;
  signatureInformations: ISignatureInformation[];
  signatureCount: number;
}

interface ISignatureInformation {
  id: string;
  signatureFormat: string;
  signerName: string;
  signatureDate: string;
  fieldName: string;
  reason: string | null;
  location: string | null;
  certLevelCode: number;
  signatureAlgorithm: string | null;
  digestAlgorithm: string | null;
  timestampInfomation: ITimestampInformation;
  certificateDetails: ICertificateDetail[];
  integrityValid: boolean;
  certificateTrusted: boolean;
  lastSignature: boolean;
  ltv?: boolean;
  modified?: boolean;
}

interface ITimestampInformation {
  id: string;
  signerName: string;
  timestampDate: string;
}

interface ICertificateDetail {
  id: string;
  issuerName: string;
  notBeforeDate: string;
  notAfterDate: string;
  signatureAlgoritm: string;
  keyUsages: string[];
  commonName: string;
  serialNumber: string;
}

// Helper types for handling both timestamp formats
type DateLike = string | number | Date;

type FlexibleSignatureVerificationResponse = Omit<
  SignatureVerificationResponse,
  "signatureInformations"
> & {
  signatureInformations: FlexibleSignatureInformation[];
};

type FlexibleSignatureInformation = Omit<
  SignatureInformation,
  "signatureDate" | "timestampInfomation" | "certificateDetails"
> & {
  signatureDate: DateLike;
  timestampInfomation: FlexibleTimestampInformation;
  certificateDetails: FlexibleCertificateDetail[];
};

type FlexibleTimestampInformation = Omit<
  TimestampInformation,
  "timestampDate"
> & {
  timestampDate: DateLike;
};

type FlexibleCertificateDetail = Omit<
  CertificateDetail,
  "notBeforeDate" | "notAfterDate"
> & {
  notBeforeDate: DateLike;
  notAfterDate: DateLike;
};

// Utility function to normalize dates to ISO strings
function normalizeSignatureResponse(
  response: FlexibleSignatureVerificationResponse,
): SignatureVerificationResponse {
  return {
    ...response,
    signatureInformations: response.signatureInformations.map((sig) => ({
      ...sig,
      signatureDate: normalizeDate(sig.signatureDate),
      timestampInfomation: {
        ...sig.timestampInfomation,
        timestampDate: normalizeDate(sig.timestampInfomation.timestampDate),
      },
      certificateDetails: sig.certificateDetails.map((cert) => ({
        ...cert,
        notBeforeDate: normalizeDate(cert.notBeforeDate),
        notAfterDate: normalizeDate(cert.notAfterDate),
      })),
    })),
  };
}

function normalizeDate(date: DateLike): string {
  if (typeof date === "number") {
    // Assuming Unix timestamp in milliseconds
    return new Date(date).toISOString();
  } else if (typeof date === "string") {
    // If it's already an ISO string, return as-is
    // If it's a different format, you might need additional parsing
    return date;
  } else if (date instanceof Date) {
    return date.toISOString();
  }
  return "";
}

// Usage example:
// const rawResponse: FlexibleSignatureVerificationResponse = ...; // From your API
// const normalizedResponse = normalizeSignatureResponse(rawResponse);
