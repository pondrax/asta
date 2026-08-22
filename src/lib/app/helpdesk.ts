/**
 * Shared helpdesk metadata (labels, workflow steps).
 * Plain module — NOT a `.remote.ts` file, since remote files may only
 * export remote functions.
 */
import type {
  HelpdeskService,
  HelpdeskServiceType,
  HelpdeskStage,
  HelpdeskStatus,
} from "$lib/server/db/schema";

export const SERVICE_LABELS: Record<HelpdeskService, string> = {
  email: "Email Pegawai",
  certificate: "Sertifikat Elektronik (BSrE)",
};

export const SERVICE_TYPE_LABELS: Record<HelpdeskServiceType, string> = {
  email_new: "Pembuatan Email Baru",
  email_password_reset: "Reset Password Email",
  certificate_registration: "Registrasi Sertifikat Baru",
  certificate_renewal: "Perpanjangan Sertifikat",
  certificate_revocation: "Pencabutan Sertifikat",
  certificate_passphrase_reset: "Reset Passphrase Sertifikat",
};

export const STATUS_LABELS: Record<HelpdeskStatus, string> = {
  open: "Baru",
  processing: "Diproses",
  waiting_user: "Menunggu Pengguna",
  completed: "Selesai",
  cancelled: "Dibatalkan",
  rejected: "Ditolak",
};

export const STAGE_STEPS: HelpdeskStage[] = [
  "submitted",
  "identity_check",
  "bsre_check",
  "waiting_user_activation",
  "processing",
  "final_review",
  "completed",
];

export const STAGE_LABELS: Record<HelpdeskStage, string> = {
  submitted: "Tiket Dibuat",
  identity_check: "Verifikasi Identitas",
  bsre_check: "Pemeriksaan BSrE",
  waiting_user_activation: "Aktivasi oleh Pengguna",
  processing: "Proses Layanan",
  final_review: "Review Akhir",
  completed: "Selesai",
};

/** Stages relevant per service type (used to render a shorter stepper). */
export function stageFlow(serviceType?: string | null): HelpdeskStage[] {
  if (!serviceType) return STAGE_STEPS;
  if (serviceType.startsWith("email")) {
    return ["submitted", "identity_check", "processing", "final_review", "completed"];
  }
  return STAGE_STEPS;
}

/**
 * Human-friendly ticket number: first 6 chars of the CUID, uppercased.
 * The CUID itself is the only identifier — no separate column needed.
 */
export function ticketNumber(id: string): string {
  return id.slice(0, 6).toUpperCase();
}

/** Outcome of the automatic BSrE check that determines the certificate action. */
export type BsreDetermination =
  | "not_found"
  | "active_issue"
  | "expired"
  | "revoked";

export const DETERMINATION_LABELS: Record<BsreDetermination, string> = {
  not_found: "Registrasi Sertifikat Baru",
  active_issue: "Reset Passphrase Sertifikat",
  expired: "Perpanjangan Sertifikat",
  revoked: "Pencabutan / Perpanjangan Sertifikat",
};
