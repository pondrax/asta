export type SignatureVerificationResponse = {
  conclusion: "VALID" | "INVALID" | string;
  description: string;
  signatureInformations: SignatureInformation[];
  signatureCount: number;
};

type SignatureInformation = {
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
  timestampInfomation: TimestampInformation; // Note: typo in property name "Infomation" vs "Information"
  certificateDetails: CertificateDetail[];
  integrityValid: boolean;
  certificateTrusted: boolean;
  lastSignature: boolean;
};

type TimestampInformation = {
  id: string;
  signerName: string;
  timestampDate: string; // ISO 8601 date string
};

type CertificateDetail = {
  id: string;
  commonName: string;
  issuerName: string;
  serialNumber: string;
  notAfterDate: string; // ISO 8601 date string
  notBeforeDate: string; // ISO 8601 date string
  signatureAlgoritm: string; // Note: typo in property name "Algoritm" vs "Algorithm"
  keyUsages: string[];
};

// Alternative interface versions if you prefer interfaces:
interface ISignatureVerificationResponse {
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
}

interface ITimestampInformation {
  id: string;
  signerName: string;
  timestampDate: string;
}

interface ICertificateDetail {
  id: string;
  commonName: string;
  issuerName: string;
  serialNumber: string;
  notAfterDate: string;
  notBeforeDate: string;
  signatureAlgoritm: string;
  keyUsages: string[];
}