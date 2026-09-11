import { command, getRequestEvent, query } from "$app/server";
import { error } from "@sveltejs/kit";
import { type } from "arktype";
import { and, count, eq, gte, ilike, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import {
  documents,
  helpdesk,
  helpdeskComments,
  helpdeskEvents,
  helpdeskNotifications,
  helpdeskSurveys,
  type HelpdeskService,
  type HelpdeskServiceType,
  type HelpdeskStage,
  type HelpdeskStatus,
} from "$lib/server/db/schema";
import {
  SERVICE_TYPE_LABELS,
  STATUS_LABELS,
  ticketNumber as toTicketNumber,
} from "$lib/app/helpdesk";
import { FileStorage } from "$lib/server/storage";
import { sendWhatsAppText } from "$lib/server/notify";
import { resolveEnv } from "$lib/server/db/utils";
import { createId } from "$lib/utils";
import { fetchAsnByNip } from "./bkpsdm";

const storage = new FileStorage;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowISO() {
  return new Date().toISOString();
}

/** Absolute ticket URL (uses ORIGIN env), with ?phone= prefill for the requester. */
async function ticketLink(ticketId: string, phone?: string | null) {
  const env = await resolveEnv();
  const origin = env.ORIGIN || "";
  const qs = phone ? `?phone=${encodeURIComponent(phone)}` : "";
  return `${origin}/helpdesk/ticket/${ticketId}${qs}`;
}

export type HelpdeskRequesterEntry = {
  name?: string;
  nip?: string;
  nik?: string;
  email?: string;
  position?: string;
  rank?: string;
  emailAccess?: boolean;
};

/**
 * Parse one pasted CSV/text line into a requester entry.
 * Accepted shapes per line (comma / semicolon / tab separated):
 *   "Nama", "Nama, NIK/NIP", "Nama, NIK/NIP, email", "email", ...
 */
function parseRequesterLine(line: string): HelpdeskRequesterEntry {
  const parts = line
    .split(/[,;\t]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: HelpdeskRequesterEntry = {};
  for (const p of parts) {
    const digits = p.replace(/\D/g, "");
    if (!out.email && /^\S@\S+\.\S+$/.test(p)) {
      out.email = p;
    } else if (!out.nip && !out.nik && /^\d{16,18}$/.test(digits)) {
      if (digits.length === 18) out.nip = digits;
      else out.nik = digits;
    } else if (!out.name) {
      out.name = p;
    } else if (!out.position) {
      out.position = p;
    } else if (!out.rank) {
      out.rank = p;
    } else if (out.emailAccess === undefined && /^(yes|no|1|0)$/i.test(p)) {
      out.emailAccess = /^(yes|1)$/i.test(p);
    }
  }
  return out;
}

async function logEvent(
  helpdeskId: string,
  event: string,
  actorType: 'user' | 'admin' | 'system',
  actorId?: string | null,
  metadata?: Record<string, unknown>,
) {
  await db.insert(helpdeskEvents).values({ helpdeskId, event, actorType, actorId, metadata });
}

/**
 * Persist + send a WhatsApp notification for a ticket.
 * Never throws — notification failure must not break ticket operations.
 */
async function notifyTicket(opts: {
  helpdeskId: string;
  type: string;
  recipient?: string | null;
  message: string;
}) {
  const recipient = opts.recipient || null;
  await db.insert(helpdeskNotifications).values({
    helpdeskId: opts.helpdeskId,
    type: opts.type,
    channel: "whatsapp",
    recipient,
    message: opts.message,
    status: "pending",
  });

  let status: 'sent' | 'failed' = 'failed';
  try {
    const ok = await sendWhatsAppText(opts.message, recipient ?? undefined);
    status = ok ? "sent" : "failed";
  } catch {
    status = "failed";
  }

  await db
    .update(helpdeskNotifications)
    .set({ status, sentAt: status === "sent" ? nowISO() : null })
    .where(
      and(
        eq(helpdeskNotifications.helpdeskId, opts.helpdeskId),
        eq(helpdeskNotifications.type, opts.type),
        sql`${helpdeskNotifications.sentAt} is null`,
      ),
    );
}

/** Current actor info from session (admin/user) or anonymous ticket access. */
function getActor(): { type: 'user' | 'admin'; id: string; name: string } | null {
  const user = getRequestEvent().locals.user;
  if (!user) return null;
  const isAdmin = user.role?.name === "admin";
  return {
    type: isAdmin ? "admin" : "user",
    id: user.id,
    name: user.email ?? "-",
  };
}

/**
 * Verify that the current request may read this ticket:
 * - admin always
 * - authenticated requester whose email matches requesterEmail
 * - phone number verified (for unauthenticated public access)
 */
async function assertTicketAccess(ticketId: string, phone?: string) {
  const event = getRequestEvent();
  const user = event.locals.user;

  const ticket = await db.query.helpdesk.findFirst({
    where: { id: ticketId },
    with: { organization: true },
  });
  if (!ticket) throw error(404, "Tiket tidak ditemukan");

  if (user?.role?.name === "admin") return ticket;

  if (
    user &&
    ticket.requesterEmail &&
    user.email &&
    user.email.toLowerCase() === ticket.requesterEmail.toLowerCase()
  ) {
    return ticket;
  }

  // Phone verification for unauthenticated access
  if (phone && ticket.requesterPhone) {
    const cleanPhone = phone.replace(/\D/g, "");
    const cleanTicketPhone = ticket.requesterPhone.replace(/\D/g, "");
    if (cleanPhone === cleanTicketPhone) {
      return ticket;
    }
  }

  error(403, "Anda tidak memiliki akses ke tiket ini. Masukkan nomor telepon yang terdaftar pada tiket ini.");
}

/** Public phone verification to access ticket */
export const verifyPhoneAccess = command(
  type({ ticketId: "string", phone: "string>0" }),
  async ({ ticketId, phone }) => {
    const ticket = await assertTicketAccess(ticketId, phone);
    return { success: true as const, ticketNumber: toTicketNumber(ticket.id) };
  }
);

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

export const getServiceCatalog = query("unchecked", async () => {
  return Object.entries(SERVICE_TYPE_LABELS).map(([value, label]) => ({
    value: value as HelpdeskServiceType,
    label,
    service: (value.startsWith("email") ? "email" : "certificate") as HelpdeskService,
  }));
});

export const getTicket = query(type({ id: "string", phone: "string?" }), async ({ id, phone }) => {
  const ticket = await assertTicketAccess(id, phone);

  const [comments, events, survey] = await Promise.all([
    db.query.helpdeskComments.findMany({
      where: { helpdeskId: id },
      orderBy: (t, { asc }) => [asc(t.created)],
    }),
    db.query.helpdeskEvents.findMany({
      where: { helpdeskId: id },
      orderBy: (t, { asc }) => [asc(t.created)],
    }),
    db.query.helpdeskSurveys.findFirst({ where: { helpdeskId: id } }),
  ]);

  // Linked tickets: parent + children (e.g. certificate ↔ email prerequisite).
  const linked: {
    id: string;
    serviceType: HelpdeskServiceType | null;
    status: HelpdeskStatus | null;
    stage: HelpdeskStage | null;
    created: string | null;
  }[] = [];

  if (ticket.parentId) {
    const parent = await db.query.helpdesk.findFirst({
      where: { id: ticket.parentId },
      columns: {
        id: true,
        serviceType: true,
        status: true,
        stage: true,
        created: true,
      },
    });
    if (parent) linked.push(parent);
  }
  const children = await db.query.helpdesk.findMany({
    where: { parentId: id },
    columns: {
      id: true,
      serviceType: true,
      status: true,
      stage: true,
      created: true,
    },
    orderBy: (t, { asc }) => [asc(t.created)],
  });
  linked.push(...children);

  // Attachments are stored as rows in the shared `documents` table; the link
  // back to this ticket lives in documents.to ([ticketId]) — queryable,
  // unlike the encrypted metadata column.
  const attachments = await db.query.documents.findMany({
    where: { to: { arrayContains: [id] } },
    columns: { id: true, title: true, files: true, created: true },
    orderBy: (t, { desc }) => [desc(t.created)],
  });

  const isAdmin = getRequestEvent().locals.user?.role?.name === "admin";

  return {
    ...ticket,
    ticketNumber: toTicketNumber(ticket.id),
    // hide internal notes from public requester
    comments: comments.filter((c) => isAdmin || !c.isInternal),
    events,
    survey,
    linked,
    attachments,
  };
});

/** Public lookup by ticket number (first 6 CUID chars). */
export const lookupTicket = command(
  type({ q: "string" }),
  async ({ q }) => {
    const raw = q.trim();

    const ticket = await db.query.helpdesk.findFirst({
      where: {
        id: { ilike: `${raw}%` }
      },
      columns: { id: true, requesterPhone: true },
    });

    if (!ticket)
      return { success: false as const, message: "Tiket tidak ditemukan." };

    return { success: true as const, id: ticket.id, hasPhone: !!ticket.requesterPhone };
  },
);

/** Organizations for the helpdesk request form. */
export const getOrganizations = query("unchecked", async () => {
  return db.query.organizations.findMany({
    columns: { id: true, name: true, short_name: true },
    orderBy: (o, { asc }) => [asc(o.name)],
  });
});

// ---------------------------------------------------------------------------
// Admin queries
// ---------------------------------------------------------------------------

export const getAdminStats = query("unchecked", async () => {
  const user = getRequestEvent().locals.user;
  if (user?.role?.name !== "admin") return null;

  const rows = await db
    .select({ status: helpdesk.status, service: helpdesk.service, n: count() })
    .from(helpdesk)
    .groupBy(helpdesk.status, helpdesk.service);

  const byStatus: Record<string, number> = {};
  const byService: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const n = Number(r.n);
    total += n;
    if (r.status) byStatus[r.status] = (byStatus[r.status] ?? 0) + n;
    if (r.service) byService[r.service] = (byService[r.service] ?? 0) + n;
  }

  // last 7 days created counts
  const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  since.setHours(0, 0, 0, 0);
  const recent = await db
    .select({
      day: sql<string>`to_char(${helpdesk.created}, 'YYYY-MM-DD')`,
      n: count(),
    })
    .from(helpdesk)
    .where(gte(helpdesk.created, sql`${since.toISOString()}`))
    .groupBy(sql`to_char(${helpdesk.created}, 'YYYY-MM-DD')`);

  return { total, byStatus, byService, recent };
});

// ---------------------------------------------------------------------------
// Certificate flow — automatic BSrE determination
// ---------------------------------------------------------------------------

export type BsreCheckResult = {
  found: boolean;
  determination?: "not_found" | "active_issue" | "expired" | "revoked";
  suggestedServiceType?: HelpdeskServiceType;
  nama?: string | null;
  emailAddress?: string | null;
  username?: string | null;
  organisasi?: string | null;
  organisasiUnit?: string | null;
  jabatanOrganisasi?: string | null;
  // BKPSDM ASN data (NIP lookups only)
  jabatan?: string | null;
  unitkerja?: string | null;
  golongan?: string | null;
  statusPegawai?: string | null;
  asnFound?: boolean;
  status?: string | null;
  aktif?: boolean | null;
  certificateStatus?: string | null;
  certStart?: string | null;
  certEnd?: string | null;
  certCount?: number;
};

/** Map BSrE account/certificate state → suggested certificate action.
 * Note: `aktif` is never populated by sync (always NULL), so certificateStatus
 * is the primary signal. Observed values: ISSUE | DENIED | EXPIRED | NEW | REVOKE.
 */
function determineAction(row: {
  aktif: boolean | null;
  status: string | null;
  certificateStatus: string | null;
  certEnd: string | null;
}): NonNullable<BsreCheckResult["determination"]> {
  const certStatus = (row.certificateStatus || "").toUpperCase();
  const accountStatus = (row.status || "").toUpperCase();

  if (
    certStatus === "REVOKE" ||
    certStatus.includes("CANCEL") ||
    accountStatus === "DENIED"
  ) {
    return "revoked";
  }

  // Expired: explicit EXPIRED status or end date already passed.
  if (certStatus === "EXPIRED") return "expired";
  if (row.certEnd) {
    const end = new Date(row.certEnd);
    if (!Number.isNaN(end.getTime()) && end.getTime() < Date.now()) {
      return "expired";
    }
  }

  // Has a live issued certificate → passphrase reset territory.
  if (certStatus === "ISSUE" || row.aktif) return "active_issue";

  // No usable certificate yet (NEW / none) → fresh registration.
  return "not_found";
}

function suggestedServiceType(
  determination: NonNullable<BsreCheckResult["determination"]>,
): HelpdeskServiceType {
  switch (determination) {
    case "active_issue":
      return "certificate_passphrase_reset";
    case "expired":
      return "certificate_renewal";
    case "revoked":
      return "certificate_renewal";
    default:
      return "certificate_registration";
  }
}

export const checkIdentity = query(type({
  identity: /^\d{16}$|^\d{18}$/,
}), async ({ identity }) => {
  const isNip = identity.length === 18;

  // NIP → check BKPSDM first for authoritative ASN data (nama, jabatan, unit,
  // golongan, status). Best-effort: null on failure, never blocks the check.
  const asn = isNip ? await fetchAsnByNip(identity) : null;

  const row = await db.query.bsreUsers.findFirst({
    where: isNip ? { nip: identity } : { nik: identity },
  });

  if (!row) {
    return {
      found: false,
      determination: "not_found",
      suggestedServiceType: "certificate_registration",
      // Still surface BKPSDM data so the form can be prefilled.
      nama: asn?.nama ?? null,
      jabatan: asn?.jabatan ?? null,
      unitkerja: asn?.unitkerja ?? null,
      golongan: asn?.golongan ?? null,
      statusPegawai: asn?.StatusPegawai ?? null,
      asnFound: Boolean(asn),
    };
  }

  const certs: any[] = (row.details as any)?.data?.sertifikat ?? [];
  const determination = determineAction(row);
  return {
    found: true,
    determination,
    suggestedServiceType: suggestedServiceType(determination),
    nama: row.nama ?? asn?.nama ?? null,
    emailAddress: row.emailAddress,
    username: row.username,
    organisasi: row.organisasi,
    organisasiUnit: row.organisasiUnit,
    jabatanOrganisasi: row.jabatanOrganisasi ?? asn?.jabatan ?? null,
    jabatan: asn?.jabatan ?? null,
    unitkerja: asn?.unitkerja ?? null,
    golongan: asn?.golongan ?? null,
    statusPegawai: asn?.StatusPegawai ?? null,
    asnFound: Boolean(asn),
    status: row.status,
    aktif: row.aktif,
    certificateStatus: row.certificateStatus,
    certStart: row.certStart,
    certEnd: row.certEnd,
    certCount: certs.length,
  };
})

/** Batch BSrE identity check for kumulatif certificate mode. */
export const batchCheckBsre = query(type({
  identities: "string[]",
}), async ({ identities }) => {
  const results: Record<string, any> = {};
  for (const id of identities) {
    const clean = id.replace(/\D/g, "");
    if (clean.length !== 16 && clean.length !== 18) continue;
    const isNip = clean.length === 18;

    // NIP → check BKPSDM first for authoritative ASN data (best-effort).
    const asn = isNip ? await fetchAsnByNip(clean) : null;

    const row = await db.query.bsreUsers.findFirst({
      where: isNip ? { nip: clean } : { nik: clean },
    });
    if (!row) {
      results[clean] = {
        found: false,
        determination: "not_found",
        suggestedServiceType: "certificate_registration",
        nama: asn?.nama ?? null,
        jabatan: asn?.jabatan ?? null,
        unitkerja: asn?.unitkerja ?? null,
        golongan: asn?.golongan ?? null,
        statusPegawai: asn?.StatusPegawai ?? null,
        asnFound: Boolean(asn),
      };
    } else {
      const determination = determineAction(row);
      results[clean] = {
        found: true,
        determination,
        suggestedServiceType: suggestedServiceType(determination),
        nama: row.nama ?? asn?.nama ?? null,
        nik: row.nik,
        nip: row.nip,
        emailAddress: row.emailAddress,
        jabatan: row.jabatanOrganisasi ?? asn?.jabatan ?? null,
        unitkerja: asn?.unitkerja ?? null,
        golongan: asn?.golongan ?? null,
        statusPegawai: asn?.StatusPegawai ?? null,
        asnFound: Boolean(asn),
        organisasi: row.organisasi,
        status: row.status,
        aktif: row.aktif,
        certStart: row.certStart,
        certEnd: row.certEnd,
      };
    }
  }
  return results;
});

// ---------------------------------------------------------------------------
// Commands — public
// ---------------------------------------------------------------------------

// NOTE: `"string?"` marks an OPTIONAL KEY — `"string | undefined"` would still
// require the key to be present ("was missing" validation errors).
const createTicketSchema = type({
  service: "'email'|'certificate'",
  serviceType: "'email_new'|'email_password_reset'|'certificate_registration'|'certificate_renewal'|'certificate_revocation'|'certificate_passphrase_reset'",
  subject: "string>0",
  description: "string>0",
  requesterName: "string>0",
  requesterNip: "string|undefined",
  requesterNik: "string|undefined",
  requesterPhone: "string>0",
  requesterEmail: "string|undefined",
  organizationId: "string|undefined",
  requesterPosition: "string|undefined",
  requesterRank: "string|undefined",
  parentId: "string|undefined",
  documentId: "string|undefined",
  // Bulk request: raw text/CSV lines (one requester per line). One ticket
  // covers them all — the single signed application document applies to every
  // listed requester.
  requesters: "string[]|undefined",
  // Kumulatif mode: name of the official signing the shared document on
  // behalf of every listed requester.
  signerName: "string|undefined",
});

export const createTicket = command(createTicketSchema, async (props) => {
  const event = getRequestEvent();
  const user = event.locals.user;

  const { documentId, requesters, signerName, ...insertProps } = props;

  // Parse the pasted list into structured entries.
  const list = (requesters ?? [])
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseRequesterLine);

  // Requester list & signer live in metadata only — the description stays
  // clean (the admin table renders them from metadata).
  const metadata: Record<string, unknown> = {};
  if (list.length > 0) {
    metadata.requesters = list;
    metadata.requesterCount = list.length;
  }
  if (signerName?.trim()) {
    metadata.signerName = signerName.trim();
  }
  // Jabatan & pangkat pemohon (opsional)
  if (insertProps.requesterPosition?.trim()) {
    metadata.requesterPosition = (insertProps.requesterPosition as string).trim();
  }
  if (insertProps.requesterRank?.trim()) {
    metadata.requesterRank = (insertProps.requesterRank as string).trim();
  }
  // Remove non-DB props from insertProps
  delete (insertProps as any).requesterPosition;
  delete (insertProps as any).requesterRank;

  // Kumulatif certificate: batch-check BSrE for all NIP/NIK in requester rows.
  if (list.length > 0 && props.service === "certificate") {
    const identities = list
      .map((r) => r.nip || r.nik)
      .filter(Boolean) as string[];
    if (identities.length > 0) {
      const bsreResults: Record<string, any> = {};
      for (const raw of identities) {
        const id = raw.replace(/\D/g, "");
        if (id.length !== 16 && id.length !== 18) continue;
        const isNip = id.length === 18;
        try {
          const row = await db.query.bsreUsers.findFirst({
            where: isNip ? { nip: id } : { nik: id },
          });
          if (!row) {
            bsreResults[id] = { found: false, determination: "not_found" };
          } else {
            bsreResults[id] = {
              found: true,
              determination: determineAction(row),
              nama: row.nama,
              status: row.status,
              aktif: row.aktif,
            };
          }
        } catch {
          bsreResults[id] = { found: false, determination: "error" };
        }
      }
      metadata.bsreChecks = bsreResults;
    }
  }

  const [ticket] = await db.insert(helpdesk).values({
    ...insertProps,
    status: "open",
    // New tickets start at identity verification, not the creation step.
    stage: "identity_check",
    metadata,
  }).returning();

  const ticketNo = toTicketNumber(ticket.id);

  if (documentId) {
    const doc = await db.query.documents.findFirst({ where: { id: documentId } });
    if (doc) {
      const currentTo = doc.to || [];
      if (!currentTo.includes(ticket.id)) {
        await db.update(documents)
          .set({ to: [...currentTo, ticket.id] })
          .where(eq(documents.id, documentId));
      }
    }
  }

  await logEvent(ticket.id, "ticket_created", user ? "user" : "system", user?.id, {
    ticketNumber: ticketNo,
    serviceType: props.serviceType,
  });

  // Notify admin ops number (best-effort)
  notifyTicket({
    helpdeskId: ticket.id,
    type: "ticket_created_admin",
    message:
      `🎫 *Tiket Helpdesk Baru*\n` +
      `No: *${ticketNo}*\n` +
      `\n` +
      `Layanan: ${SERVICE_TYPE_LABELS[props.serviceType]}\n` +
      `Pemohon: ${props.requesterName}${list.length > 1 ? ` (+${list.length - 1} lainnya)` : ""}\n` +
      `Subjek: ${props.subject}\n` +
      `\n` +
      `🔗 ${await ticketLink(ticket.id, props.requesterPhone)}`,
  }).catch(() => { });

  return {
    success: true as const,
    id: ticket.id,
    ticketNumber: ticketNo,
  };
});

export const addComment = command(
  type({
    ticketId: "string",
    message: "string>0",
    // Where the comment was posted from determines authorship:
    // "admin" = staff console (petugas), "public" = ticket page (pemohon)
    context: "'admin'|'public'",
    isInternal: "boolean?",
    // Phone for unauthenticated requester verification
    phone: "string|undefined",
  }),
  async ({ ticketId, message, context, isInternal, phone }) => {
    const event = getRequestEvent();
    const user = event.locals.user;
    const isAdmin = context === "admin";
    // Admin replies may only be posted from the staff console (/main/helpdesk)
    if (isAdmin && user?.role?.name !== "admin")
      throw error(403, "Hanya admin dapat membalas dari konsol petugas.");

    const ticket = await assertTicketAccess(ticketId, phone);
    const ticketNo = toTicketNumber(ticket.id);

    const authorType: 'user' | 'admin' = isAdmin ? "admin" : "user";
    const internal = Boolean(isInternal && isAdmin);

    const [comment] = await db.insert(helpdeskComments).values({
      helpdeskId: ticketId,
      authorType,
      authorId: user?.id ?? null,
      authorName: user?.email ?? (ticket.requesterName || "Pemohon"),
      message,
      isInternal: internal,
    }).returning();

    await logEvent(ticketId, "comment_created", authorType, user?.id, {
      commentId: comment.id,
      internal,
    });

    // Comments are only stored on the web — no WhatsApp notification.
    if (!isAdmin) {
      notifyTicket({
        helpdeskId: ticketId,
        type: "comment_user",
        message:
          `💬 *Pesan Baru dari Pemohon*\n` +
          `Tiket *${ticketNo}*\n` +
          `\n` +
          `Pemohon: ${ticket.requesterName || "-"}\n` +
          `\n` +
          `🔗 ${await ticketLink(ticketId, ticket.requesterPhone)}`,
      }).catch(() => { });
    }

    return { success: true as const, comment };
  },
);

/**
 * Upload an attachment for a ticket. Files are stored through the shared
 * storage pipeline and registered as rows in the existing `documents` table.
 * The ticket link lives in documents.to ([ticketId]) so listings can query it
 * directly — the metadata column is encrypted and not SQL-queryable.
 */
export const uploadAttachment = command(
  type({
    ticketId: "string",
    fileName: "string",
    mimeType: "string",
    fileBase64: "string",
  }),
  async ({ ticketId, fileName, mimeType, fileBase64 }) => {
    const ticket = await assertTicketAccess(ticketId);
    const user = getRequestEvent().locals.user;
    const isAdmin = user?.role?.name === "admin";

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const buffer = Buffer.from(fileBase64, "base64");
    if (!buffer.length) throw error(400, "File tidak valid");

    const docId = createId(10);
    const saved = await storage.save(`documents/${docId}-${safeName}`, buffer);
    if (!saved.success) throw error(500, "Gagal menyimpan berkas");

    const [doc] = await db.insert(documents).values({
      id: docId,
      owner: user?.email ?? ticket.requesterEmail ?? null,
      title: fileName,
      files: [saved.url ?? `/uploads/${saved.path}`],
      to: [ticketId],
      esign: false,
      status: "signed",
      metadata: {
        mimeType,
        size: buffer.length,
        uploadedBy: user?.id ?? (isAdmin ? "admin" : "requester"),
      } as any,
    }).returning({ id: documents.id, title: documents.title, created: documents.created });

    await logEvent(ticketId, "attachment_uploaded", isAdmin ? "admin" : "user",
      user?.id, {
      attachmentId: doc.id,
      fileName,
    });

    return { success: true as const, attachment: doc };
  },
);

export const submitTicketSurvey = command(
  type({
    ticketId: "string",
    rating: "1<=number<=5",
    ease: "1<=number<=5",
    comment: "string?",
    // Phone for unauthenticated requester verification
    phone: "string|undefined",
  }),
  async ({ ticketId, rating, ease, comment, phone }) => {
    await assertTicketAccess(ticketId, phone);

    const ticket = await db.query.helpdesk.findFirst({
      where: { id: ticketId },
      columns: { status: true },
    });
    if (ticket?.status !== "completed") {
      throw error(400, "Survey hanya tersedia untuk tiket yang sudah selesai.");
    }

    const existing = await db.query.helpdeskSurveys.findFirst({
      where: { helpdeskId: ticketId },
    });
    if (existing) return { success: true as const, alreadySubmitted: true };

    await db.insert(helpdeskSurveys).values({ helpdeskId: ticketId, rating, ease, comment });
    await logEvent(ticketId, "survey_submitted", "user", null, { rating, ease });

    return { success: true as const, alreadySubmitted: false };
  },
);

// ---------------------------------------------------------------------------
// Commands — admin workflow
// ---------------------------------------------------------------------------

/** Allowed status transitions enforced server-side. */
const STATUS_TRANSITIONS: Record<HelpdeskStatus, HelpdeskStatus[]> = {
  open: ["processing", "rejected", "cancelled"],
  processing: ["waiting_user", "completed", "rejected", "cancelled"],
  waiting_user: ["processing", "completed", "cancelled"],
  completed: [],
  cancelled: [],
  rejected: ["open"],
};

export const updateTicketStatus = command(
  type({
    ticketId: "string",
    status: "'open'|'processing'|'waiting_user'|'completed'|'cancelled'|'rejected'",
    note: "string|undefined",
  }),
  async ({ ticketId, status, note }) => {
    const user = getRequestEvent().locals.user;
    if (user?.role?.name !== "admin") throw error(403, "Hanya admin.");

    const ticket = await db.query.helpdesk.findFirst({ where: { id: ticketId } });
    if (!ticket) throw error(404, "Tiket tidak ditemukan");

    const allowed = STATUS_TRANSITIONS[ticket.status as HelpdeskStatus] ?? [];
    if (!allowed.includes(status)) {
      throw error(400, `Transisi status ${ticket.status} → ${status} tidak diizinkan.`);
    }

    const patch: Partial<typeof helpdesk.$inferInsert> = { status };
    if (status === "completed") {
      patch.completedAt = nowISO();
      patch.closedAt = nowISO();
      patch.stage = "completed";
    }
    if (status === "cancelled" || status === "rejected") {
      patch.closedAt = nowISO();
    }
    if (status === "rejected" && note) {
      patch.metadata = { ...(ticket.metadata as any), rejectionReason: note };
    }

    await db.update(helpdesk).set(patch).where(eq(helpdesk.id, ticketId));

    await logEvent(ticketId, "status_changed", "admin", user.id, {
      from: ticket.status,
      to: status,
      note,
    });

    if (note) {
      await db.insert(helpdeskComments).values({
        helpdeskId: ticketId,
        authorType: "admin",
        authorId: user.id,
        authorName: user.email,
        message: note,
        isInternal: false,
      });
    }

    const ticketNo = toTicketNumber(ticket.id);
    const statusMsg: Partial<Record<HelpdeskStatus, string>> = {
      processing: "Tiket Anda sedang diproses.",
      waiting_user: "Petugas menunggu tindakan lanjutan dari Anda. Silakan cek tiket.",
      completed: "Tiket Anda telah selesai. Silakan isi survey kepuasan.",
      cancelled: "Tiket telah dibatalkan.",
      rejected: "Tiket ditolak.",
    };
    if (statusMsg[status]) {
      notifyTicket({
        helpdeskId: ticketId,
        type: `status_${status}`,
        recipient: ticket.requesterPhone,
        message:
          `🔔 *Status Tiket Diperbarui*\n` +
          `Tiket *${ticketNo}*\n` +
          `\n` +
          `Status: *${STATUS_LABELS[status]}*\n` +
          `${statusMsg[status]}\n` +
          `\n` +
          `🔗 ${await ticketLink(ticketId, ticket.requesterPhone)}`,
      }).catch(() => { });
    }

    return { success: true as const };
  },
);

export const updateTicketStage = command(
  type({
    ticketId: "string",
    stage: "'submitted'|'identity_check'|'bsre_check'|'waiting_user_activation'|'processing'|'final_review'|'completed'",
  }),
  async ({ ticketId, stage }) => {
    const user = getRequestEvent().locals.user;
    if (user?.role?.name !== "admin") throw error(403, "Hanya admin.");

    const ticket = await db.query.helpdesk.findFirst({ where: { id: ticketId } });
    if (!ticket) throw error(404, "Tiket tidak ditemukan");

    await db.update(helpdesk).set({ stage }).where(eq(helpdesk.id, ticketId));

    await logEvent(ticketId, "stage_changed", "admin", user.id, {
      from: ticket.stage,
      to: stage,
    });

    return { success: true as const };
  },
);

/**
 * Admin: create the child Email Dinas ticket required before a certificate
 * flow can continue when the requester has no working Email Dinas access.
 * The child ticket is linked via parentId and the certificate ticket moves to
 * waiting_user until the email account is active.
 */
export const createEmailPrerequisite = command(
  type({
    ticketId: "string",
    requesterEmail: "string?",
    // Required for public (unauthenticated) access; admins skip it.
    phone: "string?",
  }),
  async ({ ticketId, requesterEmail, phone }) => {
    // Admins or the phone-verified requester may create the prerequisite.
    const user = getRequestEvent().locals.user;
    const ticket = await assertTicketAccess(ticketId, phone);

    // Reuse an existing open child email ticket instead of duplicating.
    const existingChild = await db.query.helpdesk.findFirst({
      where: { parentId: ticketId, serviceType: "email_new" },
      columns: { id: true, status: true },
    });
    if (existingChild) {
      return {
        success: true as const,
        childId: existingChild.id,
        reused: true as const,
        signUrl: `/sign?template=pengajuan-email&ticket=${existingChild.id}`,
      };
    }

    const [child] = await db.insert(helpdesk).values({
      service: "email",
      serviceType: "email_new",
      subject: `Email Dinas untuk ${toTicketNumber(ticket.id)} — ${ticket.subject ?? "Sertifikat Elektronik"}`,
      description:
        `Tiket email dinas prasyarat untuk proses sertifikat elektronik ` +
        `(tiket induk ${toTicketNumber(ticket.id)}). Dibuat otomatis.`,
      requesterName: ticket.requesterName,
      requesterNip: ticket.requesterNip,
      requesterNik: ticket.requesterNik,
      requesterPhone: ticket.requesterPhone,
      requesterEmail: requesterEmail ?? ticket.requesterEmail,
      parentId: ticket.id,
      status: "open",
      stage: "submitted",
      metadata: { prerequisiteFor: ticket.id },
    }).returning();

    await logEvent(child.id, "ticket_created", "system", user?.id ?? null, {
      ticketNumber: toTicketNumber(child.id),
      prerequisiteFor: ticket.id,
    });
    await logEvent(
      ticket.id,
      "email_prerequisite_created",
      "system",
      user?.id ?? null,
      { childId: child.id },
    );

    // Certificate ticket waits until the email account is active.
    await db.update(helpdesk)
      .set({ status: "waiting_user", stage: "waiting_user_activation" })
      .where(eq(helpdesk.id, ticket.id));
    await logEvent(ticket.id, "status_changed", "system", null, {
      from: ticket.status,
      to: "waiting_user",
    });

    notifyTicket({
      helpdeskId: child.id,
      type: "ticket_created_admin",
      message:
        `🎫 *Tiket Email Prasyarat Dibuat*\n` +
        `No: *${toTicketNumber(child.id)}*\n` +
        `\n` +
        `Untuk tiket sertifikat: *${toTicketNumber(ticket.id)}*\n` +
        `Pemohon: ${ticket.requesterName || "-"}\n` +
        `\n` +
        `🔗 ${await ticketLink(child.id, ticket.requesterPhone)}`,
    }).catch(() => { });

    return {
      success: true as const,
      childId: child.id,
      reused: false as const,
      signUrl: `/sign?template=pengajuan-email&ticket=${child.id}`,
    };
  },
);

/**
 * Called when the Email Dinas prerequisite is done (account active). The
 * certificate ticket resumes processing.
 */
export const completeEmailPrerequisite = command(
  type({ ticketId: "string" }),
  async ({ ticketId }) => {
    const user = getRequestEvent().locals.user;
    if (user?.role?.name !== "admin") throw error(403, "Hanya admin.");

    const ticket = await db.query.helpdesk.findFirst({ where: { id: ticketId } });
    if (!ticket) throw error(404, "Tiket tidak ditemukan");

    await db.update(helpdesk)
      .set({ status: "processing", stage: "bsre_check" })
      .where(eq(helpdesk.id, ticketId));
    await logEvent(ticketId, "status_changed", "admin", user.id, {
      from: ticket.status,
      to: "processing",
      reason: "email_prerequisite_completed",
    });

    return { success: true as const };
  },
);

/**
 * Mark the required signature (persetujuan-pengguna TTE form) as signed and
 * advance the ticket to final review. The signature itself happens on the
 * /sign page using the persetujuan-pengguna template; completion is recorded
 * here once the signed document exists.
 */
export const markSignatureDone = command(
  type({
    ticketId: "string",
    documentId: "string?",
  }),
  async ({ ticketId, documentId }) => {
    const user = getRequestEvent().locals.user;
    if (user?.role?.name !== "admin") throw error(403, "Hanya admin.");

    const ticket = await db.query.helpdesk.findFirst({ where: { id: ticketId } });
    if (!ticket) throw error(404, "Tiket tidak ditemukan");

    const metadata = {
      ...(ticket.metadata as any),
      signature: {
        template: "persetujuan-pengguna",
        documentId: documentId ?? null,
        signedAt: nowISO(),
      },
    };

    await db.update(helpdesk)
      .set({ metadata, stage: "final_review" })
      .where(eq(helpdesk.id, ticketId));

    await logEvent(ticketId, "signature_signed", "admin", user.id, {
      documentId: documentId ?? null,
    });

    return { success: true as const };
  },
);

/**
 * Admin: record per-user email access data (url/username/default password),
 * then notify the requester via WhatsApp. A short public comment (without
 * any credentials) is recorded so the ticket shows access was granted.
 */
export const sendAccountNotification = command(
  type({
    ticketId: "string",
    accounts: [
      {
        name: "string?",
        nip: "string?",
        nik: "string?",
        email: "string",
        password: "string?",
        keterangan: "string?",
      },
    ],
  }),
  async ({ ticketId, accounts }) => {
    const user = getRequestEvent().locals.user;
    if (user?.role?.name !== "admin") throw error(403, "Hanya admin.");

    const ticket = await db.query.helpdesk.findFirst({ where: { id: ticketId } });
    if (!ticket) throw error(404, "Tiket tidak ditemukan");

    const clean = accounts
      .map((a) => ({
        name: a.name?.trim() || undefined,
        nip: a.nip?.trim() || undefined,
        nik: a.nik?.trim() || undefined,
        email: a.email.trim(),
        password: a.password?.trim() || undefined,
        keterangan: a.keterangan?.trim() || undefined,
      }))
      .filter((a) => a.email);

    if (ticket.service === "email" && clean.length === 0) {
      throw error(400, "Isi minimal satu email pemohon.");
    }

    // Persist for reference (metadata column is encrypted at rest).
    const metadata = {
      ...(ticket.metadata as any),
      emailAccounts: clean,
    };
    await db.update(helpdesk)
      .set({ metadata })
      .where(eq(helpdesk.id, ticketId));

    const ticketNo = toTicketNumber(ticket.id);
    let msg = "";
    if (clean.length > 0) {
      msg +=
        `📧 *Akses Email mojokertokota.go.id*\n` +
        `Tiket *${ticketNo}*\n` +
        `\n` +
        `url akses = https://mail.mojokertokota.go.id\n`;
      if (clean.length > 1) {
        msg += `\n`;
        clean.forEach((a, i) => {
          if (a.name) msg += `${i + 1}. ${a.name}\n`;
          else msg += `${i + 1}. `;
          if (a.nip) msg += `nip = ${a.nip}\n`;
          if (a.nik) msg += `nik = ${a.nik}\n`;
          msg += `username/email = ${a.email}\n`;
          if (a.password) msg += `password = ${a.password}\n`;
          if (a.keterangan) msg += `keterangan = ${a.keterangan}\n`;
          msg += `\n`;
        });
      } else {
        msg += `username/email = ${clean[0].email}\n`;
        if (clean[0].nip) msg += `nip = ${clean[0].nip}\n`;
        if (clean[0].nik) msg += `nik = ${clean[0].nik}\n`;
        if (clean[0].password) msg += `password = ${clean[0].password}\n`;
        if (clean[0].keterangan)
          msg += `keterangan = ${clean[0].keterangan}\n`;
        msg += `\n`;
      }
      msg += `password default wajib diganti saat login`;
      if (ticket.service === "certificate") {
        msg += `\n\nAkses untuk aktivasi telah dikirimkan ke email tersebut.`;
      }
    } else {
      // Certificate without account data — short notice only.
      msg =
        `🔐 *Tiket ${ticketNo}*\n` +
        `\n` +
        `Akses telah dikirimkan ke email.`;
    }
    msg += `\n\n🔗 ${await ticketLink(ticketId, ticket.requesterPhone)}`;

    await notifyTicket({
      helpdeskId: ticketId,
      type: "manual",
      recipient: ticket.requesterPhone,
      message: msg,
    });

    // Record a short public comment (no credentials) so the ticket shows
    // that access was granted — sensitive data stays on WhatsApp only.
    await db.insert(helpdeskComments).values({
      helpdeskId: ticketId,
      authorType: "admin",
      authorId: user.id,
      authorName: user.email,
      message: "Akses email telah dikirimkan ke WhatsApp Anda.",
      isInternal: false,
    });
    await logEvent(ticketId, "whatsapp_sent", "admin", user.id, {
      accounts: clean.length,
    });

    return { success: true as const };
  },
);

/** Admin: attach a WhatsApp message manually (e.g. activation instructions). */
export const sendManualWhatsApp = command(
  type({ ticketId: "string", message: "string>0" }),
  async ({ ticketId, message }) => {
    const user = getRequestEvent().locals.user;
    if (user?.role?.name !== "admin") throw error(403, "Hanya admin.");

    const ticket = await db.query.helpdesk.findFirst({ where: { id: ticketId } });
    if (!ticket) throw error(404, "Tiket tidak ditemukan");

    await notifyTicket({
      helpdeskId: ticketId,
      type: "manual",
      recipient: ticket.requesterPhone,
      message:
        `📩 *Pesan dari Petugas*\n` +
        `Tiket *${toTicketNumber(ticket.id)}*\n` +
        `\n` +
        `${message}\n` +
        `\n` +
        `🔗 ${await ticketLink(ticketId, ticket.requesterPhone)}`,
    });

    await logEvent(ticketId, "whatsapp_sent", "admin", user.id, {});

    return { success: true as const };
  },
);
