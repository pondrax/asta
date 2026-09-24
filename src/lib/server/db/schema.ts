import { pgTable, integer, text, timestamp, json, jsonb } from 'drizzle-orm/pg-core';
import { id, created, updated, encryptedJson } from './utils';
import { boolean, index } from 'drizzle-orm/pg-core';
import { pgView, date } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';


export const roles = pgTable('roles', {
  id,
  name: text('name').unique(),
  description: text('description'),
  created,
  updated,
})

export const users = pgTable('users', {
  id,
  email: text('email').unique(),
  password: text('password'),
  role_id: text('role_id').references(() => roles.id).default('member'),
  organization_id: text('organization_id').references(() => organizations.id),
  created,
  updated,
});


export const posts = pgTable('posts', {
  id,
  created,
  updated,
  title: text('title'),
  content: text('content'),
  user_id: text('user_id').references(() => users.id)
});


export const signers = pgTable('signers', {
  id,
  nik: text('nik').unique(),
  nip: text('nip'),
  email: text('email').unique(),
  name: text('name'),
  position: text('position'),
  rank: text('rank'),
  organizations: text('organizations'),
  phone: text('phone'),
  created,
  updated,
})

export const documents = pgTable('documents', {
  id,
  owner: text('owner'),
  signer: text('signer'),
  title: text('title'),
  files: text('files').array(),
  signatures: text('signatures').array(),
  checksums: text('checksums').array(),
  metadata: encryptedJson('metadata'),
  histories: jsonb('histories').$type<{ signer: string; signedAt: string; status: string }[]>(),
  status: text('status').default('draft').$type<'draft' | 'queue' | 'failed' | 'signed'>(),
  esign: boolean('esign').default(true),
  signatureProperties: json('signature_properties'),
  to: text('to').array(),
  created,
  updated,
}, table => [
  index('documents_owner_idx').on(table.owner),
  index('documents_signer_idx').on(table.signer),
  index('documents_checksums_idx').on(table.checksums),
  index('documents_esign_idx').on(table.esign),
  index('documents_to_idx').on(table.to),
  index('documents_status_idx').on(table.status),
])

export const documentStatistics = pgTable('document_statistics', {
  id,
  // date: date('date').defaultNow(),
  type: text('type')
    .default('signed')
    .$type<'signed' | 'verified' | 'new-request' | 'reset-email' | 'reset-passphrase'>(),
  value: integer('value').default(0),
  created,
  updated,
})
export const templates = pgTable('templates', {
  id,
  name: text('name').unique(),
  file: text('file'),
  status: boolean('status').default(true),
  organization_id: json('organization_id').$type<string[]>(),
  to: json('to').$type<string[]>(),
  properties: json('properties').$type<Record<string, unknown>>(),
  description: text('description'),
  sign_type: text('sign_type'),
  created,
  updated,
})
export const organizations = pgTable('organizations', {
  id,
  name: text('name').unique(),
  short_name: text('short_name').unique(),
  created,
  updated,
})

export const ranks = pgTable('ranks', {
  id,
  rank: text('rank').unique(),
  grade: text('grade').unique(),
  created,
  updated,
})

export const __logs = pgTable('__logs', {
  id,
  level: text('level').default('info').$type<'info' | 'error' | 'warn'>(),
  url: text('url'),
  method: text('method'),
  message: text('message'),
  metadata: json('metadata'),
  created,
  updated,
})

export const __setting = pgTable('__setting', {

  id,
  key: text('key').unique(),
  value: text('value'),
  description: text('description'),
  created,
  updated,
})

/** Observed BSrE account statuses (bsre_users.status). */
export type BsreUserStatus = 'VERIFIED' | 'NEW' | 'UPDATE';

/** Observed BSrE certificate statuses (bsre_users.certificate_status). */
export type BsreCertStatus = 'ISSUE' | 'DENIED' | 'EXPIRED' | 'NEW' | 'REVOKE';

export const bsreUsers = pgTable('bsre_users', {
  id: text('id').primaryKey(),
  nama: text('nama'),
  emailAddress: text('email_address'),
  username: text('username'),
  nik: text('nik'),
  nip: text('nip'),
  jabatanOrganisasi: text('jabatan_organisasi'),
  organisasiUnit: text('organisasi_unit'),
  organisasi: text('organisasi'),
  phone: text('phone'),
  status: text('status').$type<BsreUserStatus>(),
  aktif: boolean('aktif'),
  certificateStatus: text('certificate_status').$type<BsreCertStatus>(),
  products: text('products'),
  createdDate: text('created_date'),
  registeredOrigin: text('registered_origin'),
  verifiedDukcapil: boolean('verified_dukcapil'),
  verifiedLiveness: boolean('verified_liveness'),
  phoneVerified: boolean('phone_verified'),
  verifiedVerifikator: boolean('verified_verifikator'),
  details: jsonb('details'),
  certStart: text('cert_start'),
  certEnd: text('cert_end'),
  fetchedAt: timestamp('fetched_at', { mode: 'string', withTimezone: true }).defaultNow(),
})

export const surveyResponses = pgTable('survey_responses', {
  id,
  email: text('email'),
  rating: integer('rating'),
  feedback: text('feedback'),
  created,
})

// ---------------------------------------------------------------------------
// Helpdesk / Ticketing
// ---------------------------------------------------------------------------

export type HelpdeskService = 'email' | 'certificate';
export type HelpdeskServiceType =
  | 'email_new'
  | 'email_password_reset'
  | 'certificate_registration'
  | 'certificate_renewal'
  | 'certificate_revocation'
  | 'certificate_passphrase_reset';
export type HelpdeskStatus =
  | 'open'
  | 'processing'
  | 'waiting_user'
  | 'completed'
  | 'cancelled'
  | 'rejected';
export type HelpdeskStage =
  | 'submitted'
  | 'identity_check'
  | 'bsre_check'
  | 'waiting_user_activation'
  | 'processing'
  | 'final_review'
  | 'completed';

export const helpdesk = pgTable('helpdesk', {
  id,
  service: text('service').$type<HelpdeskService>(),
  serviceType: text('service_type').$type<HelpdeskServiceType>(),
  status: text('status').default('open').$type<HelpdeskStatus>(),
  stage: text('stage').default('submitted').$type<HelpdeskStage>(),
  subject: text('subject'),
  description: text('description'),
  requesterName: text('requester_name'),
  requesterNip: text('requester_nip'),
  requesterNik: text('requester_nik'),
  requesterPhone: text('requester_phone'),
  requesterEmail: text('requester_email'),
  organizationId: text('organization_id').references(() => organizations.id),
  parentId: text('parent_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  completedAt: timestamp('completed_at', { mode: 'string', withTimezone: true }),
  closedAt: timestamp('closed_at', { mode: 'string', withTimezone: true }),
  created,
  updated,
}, table => [
  index('helpdesk_status_idx').on(table.status),
  index('helpdesk_service_idx').on(table.service),
  index('helpdesk_requester_phone_idx').on(table.requesterPhone),
  index('helpdesk_requester_nik_idx').on(table.requesterNik),
])

export const helpdeskComments = pgTable('helpdesk_comments', {
  id,
  helpdeskId: text('helpdesk_id').references(() => helpdesk.id).notNull(),
  authorType: text('author_type').$type<'user' | 'admin' | 'system'>(),
  authorId: text('author_id'),
  authorName: text('author_name'),
  message: text('message').notNull(),
  isInternal: boolean('is_internal').default(false),
  created,
  updated,
}, table => [
  index('helpdesk_comments_helpdesk_idx').on(table.helpdeskId),
])

export const helpdeskEvents = pgTable('helpdesk_events', {
  id,
  helpdeskId: text('helpdesk_id').references(() => helpdesk.id).notNull(),
  event: text('event'),
  actorType: text('actor_type').$type<'user' | 'admin' | 'system'>(),
  actorId: text('actor_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  created,
  updated,
}, table => [
  index('helpdesk_events_helpdesk_idx').on(table.helpdeskId),
])

export const helpdeskNotifications = pgTable('helpdesk_notifications', {
  id,
  helpdeskId: text('helpdesk_id').references(() => helpdesk.id).notNull(),
  type: text('type'),
  channel: text('channel').default('whatsapp').$type<'whatsapp' | 'email'>(),
  recipient: text('recipient'),
  message: text('message'),
  status: text('status').default('pending').$type<'pending' | 'sent' | 'failed'>(),
  sentAt: timestamp('sent_at', { mode: 'string', withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  created,
  updated,
}, table => [
  index('helpdesk_notifications_helpdesk_idx').on(table.helpdeskId),
])

export const helpdeskSurveys = pgTable('helpdesk_surveys', {
  id,
  helpdeskId: text('helpdesk_id').references(() => helpdesk.id).unique().notNull(),
  rating: integer('rating'),
  ease: integer('ease'),
  comment: text('comment'),
  created,
  updated,
})

// ---------------------------------------------------------------------------
// Statistics views
// ---------------------------------------------------------------------------

/**
 * One row per day with all key metrics aggregated from the raw tables:
 * - e-sign counters (document_statistics): signed / verified / new-request /
 *   reset-email / reset-passphrase
 * - documents created per day, broken down by status
 * - new users & new signers
 * - helpdesk tickets opened & completed
 * - survey responses & average rating
 */
export const dailyStatistics = pgView('daily_statistics', {
  date: date('date', { mode: 'string' }).notNull(),
  signed: integer('signed').notNull(),
  verified: integer('verified').notNull(),
  newRequest: integer('new_request').notNull(),
  resetEmail: integer('reset_email').notNull(),
  resetPassphrase: integer('reset_passphrase').notNull(),
  documents: integer('documents').notNull(),
  docSigned: integer('doc_signed').notNull(),
  docDraft: integer('doc_draft').notNull(),
  docQueue: integer('doc_queue').notNull(),
  docFailed: integer('doc_failed').notNull(),
  newUsers: integer('new_users').notNull(),
  newSigners: integer('new_signers').notNull(),
  tickets: integer('tickets').notNull(),
  ticketsCompleted: integer('tickets_completed').notNull(),
  surveys: integer('surveys').notNull(),
  avgRating: text('avg_rating'),
}).as(sql`
  WITH
    dt AS (
      SELECT date_trunc('day', created)::date AS date FROM document_statistics WHERE created IS NOT NULL
      UNION SELECT date_trunc('day', created)::date FROM documents WHERE created IS NOT NULL
      UNION SELECT date_trunc('day', created)::date FROM users WHERE created IS NOT NULL
      UNION SELECT date_trunc('day', created)::date FROM signers WHERE created IS NOT NULL
      UNION SELECT date_trunc('day', created)::date FROM helpdesk WHERE created IS NOT NULL
      UNION SELECT date_trunc('day', created)::date FROM survey_responses WHERE created IS NOT NULL
    ),
    ds AS (
      SELECT
        date_trunc('day', created)::date AS date,
        COALESCE(SUM(value) FILTER (WHERE type = 'signed'), 0)::int          AS signed,
        COALESCE(SUM(value) FILTER (WHERE type = 'verified'), 0)::int        AS verified,
        COALESCE(SUM(value) FILTER (WHERE type = 'new-request'), 0)::int     AS new_request,
        COALESCE(SUM(value) FILTER (WHERE type = 'reset-email'), 0)::int     AS reset_email,
        COALESCE(SUM(value) FILTER (WHERE type = 'reset-passphrase'), 0)::int AS reset_passphrase
      FROM document_statistics
      WHERE created IS NOT NULL
      GROUP BY 1
    ),
    d AS (
      SELECT
        date_trunc('day', created)::date AS date,
        COUNT(*)::int AS documents,
        COALESCE(COUNT(*) FILTER (WHERE status = 'signed'), 0)::int AS doc_signed,
        COALESCE(COUNT(*) FILTER (WHERE status = 'draft'), 0)::int  AS doc_draft,
        COALESCE(COUNT(*) FILTER (WHERE status = 'queue'), 0)::int  AS doc_queue,
        COALESCE(COUNT(*) FILTER (WHERE status = 'failed'), 0)::int AS doc_failed
      FROM documents
      WHERE created IS NOT NULL
      GROUP BY 1
    ),
    u AS (
      SELECT date_trunc('day', created)::date AS date, COUNT(*)::int AS new_users
      FROM users WHERE created IS NOT NULL GROUP BY 1
    ),
    sg AS (
      SELECT date_trunc('day', created)::date AS date, COUNT(*)::int AS new_signers
      FROM signers WHERE created IS NOT NULL GROUP BY 1
    ),
    h AS (
      SELECT
        date_trunc('day', created)::date AS date,
        COUNT(*)::int AS tickets,
        COALESCE(COUNT(*) FILTER (WHERE status = 'completed'), 0)::int AS tickets_completed
      FROM helpdesk WHERE created IS NOT NULL GROUP BY 1
    ),
    sv AS (
      SELECT
        date_trunc('day', created)::date AS date,
        COUNT(*)::int AS surveys,
        ROUND(AVG(rating)::numeric, 2)::text AS avg_rating
      FROM survey_responses WHERE created IS NOT NULL GROUP BY 1
    )
  SELECT
    dt.date,
    COALESCE(ds.signed, 0)            AS signed,
    COALESCE(ds.verified, 0)          AS verified,
    COALESCE(ds.new_request, 0)       AS new_request,
    COALESCE(ds.reset_email, 0)       AS reset_email,
    COALESCE(ds.reset_passphrase, 0)  AS reset_passphrase,
    COALESCE(d.documents, 0)          AS documents,
    COALESCE(d.doc_signed, 0)         AS doc_signed,
    COALESCE(d.doc_draft, 0)          AS doc_draft,
    COALESCE(d.doc_queue, 0)          AS doc_queue,
    COALESCE(d.doc_failed, 0)         AS doc_failed,
    COALESCE(u.new_users, 0)          AS new_users,
    COALESCE(sg.new_signers, 0)       AS new_signers,
    COALESCE(h.tickets, 0)            AS tickets,
    COALESCE(h.tickets_completed, 0)  AS tickets_completed,
    COALESCE(sv.surveys, 0)           AS surveys,
    sv.avg_rating                     AS avg_rating
  FROM dt
  LEFT JOIN ds ON ds.date = dt.date
  LEFT JOIN d  ON d.date  = dt.date
  LEFT JOIN u  ON u.date  = dt.date
  LEFT JOIN sg ON sg.date = dt.date
  LEFT JOIN h  ON h.date  = dt.date
  LEFT JOIN sv ON sv.date = dt.date
  ORDER BY dt.date DESC
`)