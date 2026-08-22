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
  ticketNumber as toTicketNumber,
} from "$lib/app/helpdesk";
import { FileStorage } from "$lib/server/storage";
import { sendWhatsAppText } from "$lib/server/notify";
import { createId } from "$lib/utils";

const storage = new FileStorage;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowISO() {
  return new Date().toISOString();
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

/** Ticket access cookie name (per-ticket, holds an opaque token). */
const ACCESS_COOKIE = (id: string) => `hd-${id}`;

function randomToken(len = 32) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify that the current request may read this ticket:
 * - admin always
 * - authenticated requester whose email matches requesterEmail
 * - request carrying the per-ticket access token (set at creation / claim)
 */
async function assertTicketAccess(ticketId: string) {
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

  const cookieToken = event.cookies.get(ACCESS_COOKIE(ticketId));
  const expected = (ticket.metadata as any)?.accessToken;
  if (cookieToken && expected && cookieToken === expected) return ticket;

  error(403, "Anda tidak memiliki akses ke tiket ini");
}

/** Grant the current browser access to a ticket via its access cookie. */
function grantAccess(ticketId: string, metadata: unknown) {
  const token = (metadata as any)?.accessToken;
  if (!token) return;
  getRequestEvent().cookies.set(ACCESS_COOKIE(ticketId), token, {
    path: `/helpdesk/ticket/${ticketId}`,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}

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

export const getTicket = query(type({ id: "string" }), async ({ id }) => {
  const ticket = await assertTicketAccess(id);

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
      columns: { id: true, requesterPhone: true, metadata: true },
    });

    if (!ticket)
      return { success: false as const, message: "Tiket tidak ditemukan." };

    grantAccess(ticket.id, ticket.metadata);
    return { success: true as const, id: ticket.id };
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
  const row = await db.query.bsreUsers.findFirst({
    where: isNip ? { nip: identity } : { nik: identity },
  });

  if (!row) return { found: false, determination: "not_found", suggestedServiceType: "certificate_registration" };

  const certs: any[] = (row.details as any)?.data?.sertifikat ?? [];
  const determination = determineAction(row);
  return {
    found: true,
    determination,
    suggestedServiceType: suggestedServiceType(determination),
    nama: row.nama,
    emailAddress: row.emailAddress,
    username: row.username,
    organisasi: row.organisasi,
    organisasiUnit: row.organisasiUnit,
    jabatanOrganisasi: row.jabatanOrganisasi,
    status: row.status,
    aktif: row.aktif,
    certificateStatus: row.certificateStatus,
    certStart: row.certStart,
    certEnd: row.certEnd,
    certCount: certs.length,
  };
})

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
  parentId: "string|undefined",
  documentId: "string|undefined",
});

export const createTicket = command(createTicketSchema, async (props) => {
  const event = getRequestEvent();
  const user = event.locals.user;

  const accessToken = randomToken();

  const { documentId, ...insertProps } = props;

  const [ticket] = await db.insert(helpdesk).values({
    ...insertProps,
    status: "open",
    stage: "submitted",
    metadata: { accessToken },
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

  // Set access cookie so creator lands straight on their ticket
  event.cookies.set(ACCESS_COOKIE(ticket.id), accessToken, {
    path: `/helpdesk/ticket/${ticket.id}`,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  // Notify admin ops number (best-effort)
  notifyTicket({
    helpdeskId: ticket.id,
    type: "ticket_created_admin",
    message:
      `[Helpdesk] Tiket baru ${ticketNo}\n` +
      `Layanan: ${SERVICE_TYPE_LABELS[props.serviceType]}\n` +
      `Pemohon: ${props.requesterName}\n` +
      `Subjek: ${props.subject}`,
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
    isInternal: "boolean?",
  }),
  async ({ ticketId, message, isInternal }) => {
    const event = getRequestEvent();
    const user = event.locals.user;
    const isAdmin = user?.role?.name === "admin";

    const ticket = await assertTicketAccess(ticketId);
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

    // Notify the other party
    if (isAdmin && !internal) {
      notifyTicket({
        helpdeskId: ticketId,
        type: "comment_reply",
        recipient: ticket.requesterPhone,
        message: `[Helpdesk] ${ticketNo}: Balasan baru dari petugas. Cek tiket Anda.`,
      }).catch(() => { });
    } else if (!isAdmin) {
      notifyTicket({
        helpdeskId: ticketId,
        type: "comment_user",
        message: `[Helpdesk] ${ticketNo}: Pesan baru dari pemohon.`,
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
  }),
  async ({ ticketId, rating, ease, comment }) => {
    await assertTicketAccess(ticketId);

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
    note: "string?",
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
        message: `[Helpdesk] ${ticketNo}: ${statusMsg[status]}`,
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
  }),
  async ({ ticketId, requesterEmail }) => {
    const user = getRequestEvent().locals.user;
    if (user?.role?.name !== "admin") throw error(403, "Hanya admin.");

    const ticket = await db.query.helpdesk.findFirst({ where: { id: ticketId } });
    if (!ticket) throw error(404, "Tiket tidak ditemukan");

    // Reuse an existing open child email ticket instead of duplicating.
    const existingChild = await db.query.helpdesk.findFirst({
      where: { parentId: ticketId, serviceType: "email_new" },
      columns: { id: true, status: true },
    });
    if (existingChild) {
      return { success: true as const, childId: existingChild.id, reused: true as const };
    }

    const accessToken = randomToken();
    const [child] = await db.insert(helpdesk).values({
      service: "email",
      serviceType: "email_new",
      subject: `Email Dinas untuk ${toTicketNumber(ticket.id)} — ${ticket.subject ?? "Sertifikat Elektronik"}`,
      description:
        `Tiket email dinas prasyarat untuk proses sertifikat elektronik ` +
        `(tiket induk ${toTicketNumber(ticket.id)}). Dibuat otomatis oleh petugas.`,
      requesterName: ticket.requesterName,
      requesterNip: ticket.requesterNip,
      requesterNik: ticket.requesterNik,
      requesterPhone: ticket.requesterPhone,
      requesterEmail: requesterEmail ?? ticket.requesterEmail,
      parentId: ticket.id,
      status: "open",
      stage: "submitted",
      metadata: { accessToken, prerequisiteFor: ticket.id },
    }).returning();

    await logEvent(child.id, "ticket_created", "system", user.id, {
      ticketNumber: toTicketNumber(child.id),
      prerequisiteFor: ticket.id,
    });
    await logEvent(ticket.id, "email_prerequisite_created", "admin", user.id, {
      childId: child.id,
    });

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
        `[Helpdesk] Tiket email prasyarat ${toTicketNumber(child.id)} dibuat\n` +
        `Untuk tiket sertifikat: ${toTicketNumber(ticket.id)}\n` +
        `Pemohon: ${ticket.requesterName}`,
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
      message: `[Helpdesk] ${toTicketNumber(ticket.id)}: ${message}`,
    });

    await logEvent(ticketId, "whatsapp_sent", "admin", user.id, {});

    return { success: true as const };
  },
);
