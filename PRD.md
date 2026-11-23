# Product Requirements Document — Tapak Astà

| Field | Value |
| --- | --- |
| Product | Tapak Astà — Tata Pelayanan Keamanan & Asisten Sertifikat Elektronik Kota Mojokerto |
| Repository | `asta` (private) |
| Application version | `2.1.97` |
| Document version | `1.0` |
| Last updated | 2026-11-23 |
| Status | Implemented product, documented as-is with named gaps and open issues |
| Primary language | Indonesian (`id`), English (`en`) supported through Paraglide/inlang |
| Audience for this document | Product, engineering, operations, security review |

---

## 1. Product summary

Tapak Astà is a web platform owned by Pemerintah Kota Mojokerto for:

1. preparing, editing and signing electronic documents;
2. verifying the authenticity and integrity of signed PDFs;
3. managing BSrE (BSSN) certificate identities, applications and renewals;
4. routing certificate-related service requests through a helpdesk workflow;
5. giving agencies a documented, testable integration path to the BSrE eSign API.

The product serves the general public, government employees signing documents, and internal administrators who manage users, certificates, tickets, statistics and platform content. Signing is available both through the external BSrE eSign service and through a locally controlled self-signed mode.

### 1.1 Vision

Make electronic document signing and verification for Mojokerto city government services self-service, auditable, verifiable offline and integrable by other OPD systems, without requiring signers to understand certificate internals.

### 1.2 Product principles

- **Verify before trusting**: every signature can be inspected locally and checked against BSrE.
- **Never leak a passphrase**: the BSrE passphrase is used in-flight only and is never persisted.
- **Work for guests**: signing and verification do not require an application account.
- **Progressive complexity**: casual users get simple upload/sign/verify; admins get certificates, tickets, logs and statistics.
- **Degrade gracefully**: browser-only PDF tooling, on-demand DOCX editor, explicit error states.

---

## 2. Problem statement

| Problem | Current impact | Product response |
| --- | --- | --- |
| Agencies need signed PDFs but BSrE eSign is not always reachable or suitable | Signing blocked for self-signed use cases | Local manual signing mode with the same workspace |
| Verifying a signed PDF historically required external portals | Users cannot confirm local integrity and signer identity in one place | Local CMS verification plus server-side BSrE verification |
| DOCX documents cannot be signed directly | Users convert outside the app and lose formatting context | DOCX editor/conversion inside the sign workspace |
| Certificate applications and renewals are ad hoc | No tracking, no status, no audit trail | Helpdesk tickets with services, stages, statuses and events |
| Integration attempts by OPDs are repeated from scratch | Inconsistent, insecure implementations | `/integrasi` guide plus `/integrasi/playground` API v2 sandbox |
| Admins cannot see adoption or failures | No basis for operations or capacity planning | Statistics, `daily_statistics` view, logs, admin dashboards |

---

## 3. Goals and non-goals

### 3.1 Goals

- G1 — Let any visitor upload PDF/DOCX, place visual signature elements, and produce a signed PDF.
- G2 — Support both BSrE TTE and local self-signed signing from one workspace.
- G3 — Let any visitor verify a signed PDF by file, document ID, or QR scan.
- G4 — Provide identity/profile management so signers do not retype the same details.
- G5 — Provide a full helpdesk lifecycle for email/certificate requests and renewals.
- G6 — Give admins visibility into users, logs, statistics, surveys and BSrE account state.
- G7 — Publish integration guidance and a safe API playground for OPD developers.
- G8 — Keep the product secure by default: encrypted storage, hidden passphrases, masked PII, role-gated administration.

### 3.2 Non-goals

- Replacing the BSrE BSSN certificate authority or portal.
- Acting as a general-purpose document management system for all agency records.
- Long-form case management outside certificate/email services.
- Native mobile applications; responsive web is the supported client.
- Storing BSrE passphrases for later reuse.
- Building a general workflow engine; helpdesk stages are fixed for certificate services.

---

## 4. Users and roles

| Role | Local name | Description | Typical needs |
| --- | --- | --- | --- |
| Guest | Tamu | Unauthenticated visitor | Sign a PDF, verify a document, check BSrE registration status, track a ticket, read guides |
| User | Pengguna | Authenticated account with role `member` or `infra` | Personal dashboard, saved documents/templates, profile, faster repeat signing |
| Admin | Admin | Account with role `admin` | User management, logs, statistics, surveys, BSrE portal, helpdesk console, internal settings |
| Impersonated admin | — | Admin temporarily acting as another user | Support and debugging without sharing credentials |
| OPD integrator | — | Developer at another agency | Integration guide, API v2 playground, request snippets |

Role names come from the seeded role records; UI visibility is driven by the loaded user's role and organization relation.

---

## 5. Scope

### 5.1 In scope

- Public landing page, service info, privacy policy and dynamic content pages.
- Sign workspace (`/sign`), including DOCX editing and conversion.
- Verification by upload, ID and QR.
- BSrE registration/status lookup.
- Helpdesk public wizard, ticket lookup, ticket detail, survey.
- Authenticated dashboard (`/me`), documents, templates, profile.
- Admin area (`/main`), internal console (`/_`), statistics and logs.
- Chatbot, user guide, in-product tour and changelog.
- BSrE integration guide and API playground.
- Storage, encryption, background sync, notifications and operational scripts.

### 5.2 Out of scope

- Legacy `/editor` and `/sign-legacy` routes; removed and must not be reintroduced.
- Native mobile apps, desktop apps, browser extensions.
- Generic e-invoice or non-certificate document workflows.
- Replacing external trust portals linked from the navigation.

---

## 6. Functional requirements

Requirements use **MUST** for release-blocking behavior and **SHOULD** for strong expectations.

### FR-01 — Public home and information pages

| ID | Requirement |
| --- | --- |
| FR-01.1 | The home page MUST present the product identity, its purpose, and live signed/verified statistics. |
| FR-01.2 | Navigation MUST expose signing, verification, helpdesk, registration, integration, user guide and privacy policy. |
| FR-01.3 | `/pages/[path]` MUST render managed informational content. |
| FR-01.4 | External verification portals MUST be presented as references, not as replacements for in-app verification. |
| FR-01.5 | Privacy policy MUST be publicly reachable without authentication. |

Evidence: `src/routes/(asta)/+page.svelte`, `src/routes/(asta)/+layout.svelte`, `src/routes/privacy-policy/+page.svelte`, `src/routes/(asta)/pages/[path]/+page.svelte`.

### FR-02 — Authentication, session and authorization

| ID | Requirement |
| --- | --- |
| FR-02.1 | The app MUST support OAuth login through OpenID, with GitHub, Google and Microsoft providers implemented. |
| FR-02.2 | A successful OAuth callback MUST upsert the user, issue a JWT and set the `auth-token` cookie. |
| FR-02.3 | JWTs MUST be HS256, expire after 7 days, and derive their secret from `APP_SECRET`. |
| FR-02.4 | Invalid or expired tokens MUST be cleared from cookies and treated as signed-out. |
| FR-02.5 | Admins MUST be able to impersonate another user; entering `/main` with an impersonation session MUST revert to the original admin identity. |
| FR-02.6 | A development-only `/auth/auto-login` route MUST exist for local JWT cookie issuance and MUST NOT be treated as a production login flow. |
| FR-02.7 | Admin navigation MUST be visible only to users whose role is `admin`. |
| FR-02.8 | Internal/admin remote operations MUST enforce authorization server-side, not only by hiding links. |

Evidence: `src/hooks.server.ts`, `src/lib/server/plugins/jwt.ts`, `src/lib/server/auth/**`, `src/routes/auth/**`, `src/lib/utils/server.ts`.

> **Open issue OI-01**: comments claim `/main` is 403-gated for non-admins, but no `(asta)/main/+layout.server.ts` guard exists in the current tree. Authorization currently relies on hidden navigation and per-remote checks. A route-level guard MUST be added before treating `/main` as strictly admin-only.

### FR-03 — Sign workspace

#### FR-03.1 Document intake

| ID | Requirement |
| --- | --- |
| FR-03.1.1 | The workspace MUST accept PDF and DOCX through file picker and drag-and-drop. |
| FR-03.1.2 | Limits MUST be `PUBLIC_MAX_FILES=500` and `PUBLIC_MAX_FILE_SIZE_MB=20` by default. |
| FR-03.1.3 | Uploaded files MUST appear in a document list with type badges, active selection, rename/save and removal. |
| FR-03.1.4 | DOCX files MUST be convertible to PDF for signing through `/api/docx-to-pdf`. |
| FR-03.1.5 | The PDF preview MUST support fit-width, fit-height, fit-content and percentage zoom, including touch-friendly controls. |
| FR-03.1.6 | On viewports narrower than 1024px, first load SHOULD default to fit-content. |

#### FR-03.2 DOCX editing

| ID | Requirement |
| --- | --- |
| FR-03.2.1 | A new blank Word document MUST open directly in the embedded editor. |
| FR-03.2.2 | An existing DOCX MUST be editable from the toolbar entry point. |
| FR-03.2.3 | Closing the editor MUST require an explicit save/download decision through a guard modal. |
| FR-03.2.4 | The saved DOCX MUST be downloadable by filename and handed back into the workspace as a document. |
| FR-03.2.5 | The editor, its core library and its AI executor MUST be loaded on demand, not in the initial `/sign` bundle. |
| FR-03.2.6 | Zoom mode handoff between the PDF preview and the DOCX editor MUST preserve the user's selected zoom. |

Evidence: `src/routes/(asta)/sign/docx-editor-view.svelte`, `src/lib/docx-editor/editor-logic.ts`, `src/lib/utils/docx.ts`, `src/routes/api/docx-to-pdf/+server.ts`, `src/routes/(asta)/sign/+page.svelte`.

#### FR-03.3 Visual signature elements

| ID | Requirement |
| --- | --- |
| FR-03.3.1 | Users MUST be able to place image, QR code, signature box and handwritten/drawn visualisations onto a document. |
| FR-03.3.2 | Visualisations MUST be draggable and persisted as signature placements with page/coordinates/size. |
| FR-03.3.3 | A specimen/profile picker MUST populate signer name, position, agency, rank and specimen image. |
| FR-03.3.4 | Footer text MUST be toggleable and MUST be disabled appropriately when a visible signature exists. |
| FR-03.3.5 | Undo/redo, history and toolbar commands MUST work for both document editing and visual placement. |

#### FR-03.4 Signing execution

| ID | Requirement |
| --- | --- |
| FR-03.4.1 | Signing MUST support BSrE TTE mode using signer identity, passphrase and the external eSign API. |
| FR-03.4.2 | Signing MUST support self-signed mode using locally managed root/signer certificates. |
| FR-03.4.3 | Draft documents MUST skip signing and retain the uploaded file as-is. |
| FR-03.4.4 | The sign request MUST carry owner/signer, document set, signature properties, note, location, recipients, save preference and completion state. |
| FR-03.4.5 | A passcode-protected "secret" document MUST store only a hashed passcode and MUST require verification before access. |
| FR-03.4.6 | Signed results MUST be downloadable individually and as a ZIP. |
| FR-03.4.7 | Re-signing a self-signed PDF MUST reuse the existing signature field and MUST NOT create orphan CMS fields. |
| FR-03.4.8 | Root CA certificates MUST be downloadable from the TTE and verification toolbars. |

Evidence: `src/lib/remotes/sign.remote.ts`, `src/lib/server/plugins/esign.ts`, `src/lib/server/manual-sign/index.ts`, `src/lib/utils/pdf.ts`, `src/lib/server/passcode.ts`, `src/lib/utils/zip.ts`.

### FR-04 — Verification

| ID | Requirement |
| --- | --- |
| FR-04.1 | Verification MUST be startable by uploading a PDF, entering a document ID, or scanning a QR code. |
| FR-04.2 | Verification MUST perform local PDF/CMS integrity checks, including digest, certificate chain, trust, timestamp and LTV-related fields where available. |
| FR-04.3 | Verification MUST also support BSrE server verification through `/api/v2/verify/pdf`. |
| FR-04.4 | The result panel MUST show per-signature status, signer identity, issuer, validity period, trust/revocation reasoning and document preview. |
| FR-04.5 | Integrity diagnostics (`[Verify]`, `[VerifyDigest]`) MUST remain available in the browser console for troubleshooting. |
| FR-04.6 | Verification MUST increment the `verified` statistic with the correct `esign`/`manual` mode when determinable. |
| FR-04.7 | Verification results MUST support Excel export and bulk download of selected documents. |
| FR-04.8 | Encrypted or passcode-protected PDFs MUST report an explicit blocked/error state rather than silently passing. |

Evidence: `src/routes/(asta)/sign/verify-panel.svelte`, `src/routes/(asta)/sign/verify-scan.svelte`, `src/lib/utils/pdf.ts`, `src/lib/utils/xlsx.ts`, `src/lib/remotes/sign.remote.ts`.

> **Open issue OI-02**: verification statistics currently attribute unknown checksums to `esign` by default. Old or unseen manually signed files can be miscounted. Mode attribution MUST be tightened before statistics are used for reporting.

### FR-05 — Signer identity, profiles and vault

| ID | Requirement |
| --- | --- |
| FR-05.1 | Signers MUST be identified by email or NIK. |
| FR-05.2 | BSrE profile data SHOULD auto-fill name, position, rank and agency when available. |
| FR-05.3 | Reusable signer profiles with specimens MUST be creatable, selectable, remembered per email and removable. |
| FR-05.4 | A signer vault MUST expose saved signing material state for repeat signing. |
| FR-05.5 | BSrE identity data in admin views MUST mask personally identifiable information by default. |
| FR-05.6 | Identity fields MUST be locked until the BSrE account is verified, except for self-signed signing. |

Evidence: `src/routes/(asta)/sign/metadata.svelte`, `src/lib/remotes/profile.remote.ts`, `src/lib/server/db/schema.ts`, `src/routes/(asta)/main/portal-bsre/+page.svelte`.

### FR-06 — Templates and personal documents

| ID | Requirement |
| --- | --- |
| FR-06.1 | Authenticated users MUST be able to list, upload, edit and delete PDF templates. |
| FR-06.2 | A template MUST be selectable from the sign workspace to prefill a document. |
| FR-06.3 | Personal documents MUST be listable, previewable, downloadable and deletable. |
| FR-06.4 | Administrative documents MUST be maintained in a separate view from general documents. |
| FR-06.5 | Encrypted filenames MUST be displayed cleanly with `.enc` and salt suffixes removed. |

Evidence: `src/routes/(asta)/me/templates/+page.svelte`, `src/routes/(asta)/me/documents/**`, `src/routes/(asta)/templates/+page.svelte`, `src/lib/server/db/schema.ts`.

### FR-07 — BSrE registration and portal administration

| ID | Requirement |
| --- | --- |
| FR-07.1 | `/services/register` MUST check BSrE account status by email or NIK, protected by Cloudflare Turnstile. |
| FR-07.2 | The page MUST explain registration steps and link to the email-application template in `/sign`. |
| FR-07.3 | Admins MUST be able to launch and close a BSrE portal session, inspect status, fetch users and sync certificate details. |
| FR-07.4 | Admin views MUST support filtering by NIP, email and certificate date range. |
| FR-07.5 | Admins MUST be able to reset an account passphrase and run a controlled bulk reset. |
| FR-07.6 | BSrE sync MUST run through a plain-function core usable by cron, because cron cannot invoke SvelteKit remote functions directly. |
| FR-07.7 | Browser automation for BSrE MUST tolerate unavailable remote debugging and MUST NOT crash the server. |

Evidence: `src/routes/(asta)/services/register/+page.svelte`, `src/lib/remotes/sign.remote.ts`, `src/routes/(asta)/main/portal-bsre/+page.svelte`, `src/lib/remotes/bsre.remote.ts`, `src/lib/server/bsre-sync.ts`, `src/lib/server/browser.ts`, `src/lib/server/cron.ts`.

### FR-08 — Helpdesk

| ID | Requirement |
| --- | --- |
| FR-08.1 | The public helpdesk MUST offer email application, certificate service and ticket tracking entry points. |
| FR-08.2 | Both single-requester and cumulative/bulk requester modes MUST be supported. |
| FR-08.3 | A ticket MUST carry service type, requester identity, attachments, comments, events, stage and status. |
| FR-08.4 | Ticket lookup MUST work by ticket identifier and phone verification. |
| FR-08.5 | BSrE status (`not_found`, `active_issue`, `expired`, `revoked`) MUST map to the correct service action: new issuance, passphrase reset, renewal, or revocation/renewal. |
| FR-08.6 | Admin console MUST support stats tabs, filters, detail view, comments, stage/status changes, resume-after-activation, signature-done marking and attachment preview. |
| FR-08.7 | Account credential delivery MUST be possible through WhatsApp or a public comment, with PII handling appropriate to the channel. |
| FR-08.8 | A satisfaction survey MUST be available after ticket completion. |

Evidence: `src/routes/(asta)/helpdesk/**`, `src/routes/(asta)/main/helpdesk/+page.svelte`, `src/lib/app/helpdesk.ts`, `src/lib/remotes/helpdesk.remote.ts`, `src/lib/server/db/schema.ts`.

### FR-09 — Survey

| ID | Requirement |
| --- | --- |
| FR-09.1 | A standalone survey and a ticket-linked survey MUST be available. |
| FR-09.2 | The survey MUST capture a rating from 1–5 and optional feedback. |
| FR-09.3 | Survey responses MUST be stored and visible to admins. |

Evidence: `src/routes/(asta)/survey/+page.svelte`, `src/routes/(asta)/helpdesk/ticket/[id]/survey/+page.svelte`, `src/lib/remotes/survey.remote.ts`.

### FR-10 — Admin and internal tooling

| ID | Requirement |
| --- | --- |
| FR-10.1 | `/main` MUST show system statistics, daily charts, signing-mode split, distribution, top signers and disk usage. |
| FR-10.2 | `/main/users` MUST list users and support impersonation. |
| FR-10.3 | `/main/logs` and `/_/logs` MUST expose application logs. |
| FR-10.4 | `/main/survey` MUST list survey responses. |
| FR-10.5 | `/_/collections`, `/_/settings` and `/_/designer` MUST provide internal data/configuration tooling. |
| FR-10.6 | Internal routes MUST remain out of the public navigation and MUST be protected server-side. |
| FR-10.7 | `/healthcheck` MUST provide an operational liveness endpoint. |

Evidence: `src/routes/(asta)/main/**`, `src/routes/(_)/_/**`, `src/routes/(_)/healthcheck/+server.ts`, `src/lib/server/log/index.ts`.

### FR-11 — Integration guide and API playground

| ID | Requirement |
| --- | --- |
| FR-11.1 | `/integrasi` MUST document BSSN BSrE integration, six integrated OPD applications, eleven mandatory criteria and a six-stage integration flow with time estimates. |
| FR-11.2 | The guide MUST state that passphrases must never be stored in app, DB, session, cookie, localStorage or logs. |
| FR-11.3 | `/integrasi/playground` MUST allow exercising Sign PDF, Sign E-Seal, User and Verify PDF endpoints. |
| FR-11.4 | The playground MUST support Dev Client, Prod Client and manual URL selection with Basic Auth. |
| FR-11.5 | The playground MUST generate request snippets for cURL, PHP and JavaScript Fetch. |
| FR-11.6 | The playground MUST provide Base64 conversion and document preview utilities. |
| FR-11.7 | Placeholder values (`{{...}}`) MUST persist while switching endpoints within a session. |
| FR-11.8 | Requests MUST be proxied server-side through `/api/integrasi/proxy` where browser cross-origin rules require it. |

Evidence: `src/routes/(asta)/integrasi/+page.svelte`, `src/routes/(asta)/integrasi/playground/+page.svelte`, `src/routes/api/integrasi/proxy/+server.ts`.

### FR-12 — Guidance, onboarding and changelog

| ID | Requirement |
| --- | --- |
| FR-12.1 | A user guide MUST be available in-app. |
| FR-12.2 | An in-app tour MUST cover `/sign`, `/me` and `/main`. |
| FR-12.3 | The tour MUST always be skippable, including from modal/interactive steps, by button, backdrop or Escape. |
| FR-12.4 | Skipping or completing the tour MUST persist the dismissal for 24 hours and MUST NOT be undone by a pending auto-show timer. |
| FR-12.5 | A changelog popup MUST show entries matching the current page, using longest-prefix route matching, and filtered by audience (`Tamu`, `Pengguna`, `Admin`). |
| FR-12.6 | A chatbot MUST answer product questions from a curated prompt/FAQ and MUST be hidden while the tour is open. |
| FR-12.7 | Editor AI endpoints MUST support document-aware assistance and image operations. |

Evidence: `src/routes/(asta)/user-guide/+page.svelte`, `src/lib/components/tour.svelte`, `src/lib/components/changelog.svelte`, `src/lib/app/changelog.svelte.ts`, `src/scripts/build-changelog.ts`, `src/lib/components/chatbot.svelte`, `src/routes/api/chat/**`, `src/routes/api/editor-*`.

### FR-13 — Platform APIs

| ID | Requirement |
| --- | --- |
| FR-13.1 | `/api/docx-to-pdf` MUST convert DOCX to PDF server-side. |
| FR-13.2 | `/api/chat` MUST serve the general product assistant. |
| FR-13.3 | `/api/editor-chat`, `/api/editor-ai` and `/api/editor-ai-image` MUST serve the document editor assistant. |
| FR-13.4 | `/api/integrasi/proxy` MUST proxy playground requests. |
| FR-13.5 | `/uploads/[...uri]` MUST serve stored files with correct content type and clean content-disposition filename. |
| FR-13.6 | Legacy `/verify` and `/d` URLs MUST redirect into `/sign?verify=...`. |

Evidence: `src/routes/api/**`, `src/routes/(_)/uploads/[...uri]/+server.ts`, `src/hooks.server.ts`.

---

## 7. Key user flows

### 7.1 Guest signs a PDF

1. Visitor opens `/sign`.
2. Optional tour appears; Skip closes it permanently for 24 hours.
3. Visitor uploads or drags in one or more PDF/DOCX files.
4. DOCX files are converted to PDF; DOCX can be opened in the Word editor first.
5. Visitor selects the active document and previews it.
6. Visitor fills signer identity: email or NIK, name, position, agency, rank, note, location.
7. Visitor places image/QR/box/draw visualisation on the document.
8. Visitor chooses BSrE TTE or self-signed mode.
9. For TTE, visitor enters the one-time passphrase and completes Turnstile.
10. Visitor submits; the system signs, stores the document if requested, and returns a signed PDF.
11. Visitor downloads the PDF or a ZIP of all signed results.

### 7.2 Guest verifies a document

1. Visitor opens Verify from navigation or `/sign?verify=...`.
2. Visitor chooses upload, document ID, or QR scan.
3. The system performs local CMS verification and BSrE server verification where available.
4. The result panel lists every signature with validity, trust and identity details.
5. Visitor can preview the document, export metadata to Excel, or download selected files.

### 7.3 Resident requests a new BSrE email/certificate

1. Visitor opens `/helpdesk`.
2. Visitor selects email or certificate service, single or cumulative mode.
3. Visitor enters identity and contact details; phone verification may be required.
4. The system maps BSrE status to the correct request type.
5. A ticket is created with attachments and events.
6. Visitor tracks the ticket by ID and phone.
7. Admin processes the ticket, delivers credentials and marks completion.
8. Visitor submits the post-ticket survey.

### 7.4 Admin syncs BSrE certificate data

1. Admin opens `/main/portal-bsre`.
2. Admin launches or reuses a portal session.
3. Admin fetches users and synchronises certificate details.
4. The system stores/updates `bsre_users` with masked PII in list views.
5. Admin filters by NIP/email/certificate dates and resets passphrases where allowed.
6. Cron may repeat the sync through the shared plain-function core.

---

## 8. Data requirements

Schema source of truth: `src/lib/server/db/schema.ts`, relations in `src/lib/server/db/relations.ts`, migrations under `drizzle/`.

| Entity | Purpose | Key attributes |
| --- | --- | --- |
| `roles` | Authorization labels | name (`admin`, `infra`, `member`) |
| `users` | Application accounts | email, role, organization, timestamps |
| `organizations`, `ranks` | Agency and rank reference data | name, code/order |
| `signers` | Signing identities | email/NIK, name, position, agency, rank |
| `signer_profiles` | Reusable identities/specimens | owner email, label, specimen, identity fields |
| `documents` | Uploaded/signed documents | owner, signer, file keys, signature arrays, checksums, encrypted metadata, histories, status (`draft`, `queue`, `failed`, `signed`), `esign` flag, recipients, hashed passcode |
| `document_statistics` | Counters by type and mode | `signed`, `verified`, `new-request`, `reset-email`, `reset-passphrase`; `esign`, `manual` |
| `templates` | Reusable PDF templates | owner, file, name, description, status |
| `__logs` | Application events | level, message, context, timestamp |
| `__setting` | Key/value configuration | key, value |
| `bsre_users` | BSrE account/certificate snapshot | NIP, email, status, verification flags, cert range, fetched timestamp, raw details |
| `survey_responses` | Satisfaction responses | rating, feedback, source |
| `helpdesk` | Service tickets | service, type, requester, status, stage, attachments, owner |
| `helpdesk_comments` | Ticket discussion | author, body, visibility |
| `helpdesk_events` | Ticket audit trail | event type, actor, timestamp |
| `helpdesk_notifications` | Outbound notification state | channel, recipient, status |
| `helpdesk_surveys` | Ticket-linked survey | ticket, rating, feedback |
| `daily_statistics` | SQL view aggregating daily counts | signatures, documents, users, signers, tickets, surveys; Asia/Jakarta day grouping |

### 8.1 Data handling rules

- File bytes MUST be encrypted at rest with AES-256-GCM and stored with an `.enc` suffix.
- Encrypted JSON columns MUST support legacy AES-CBC decryption only as a read fallback.
- `documents.hashed_passcode` MUST contain a hash, never the raw passcode.
- BSrE passphrases MUST NOT appear in any table, cookie, session, localStorage or log.
- All schema changes MUST use `db:migrate`; `db:push` MUST NOT be used.
- Drizzle query v2 patterns MUST be used for new database access.

---

## 9. External integrations

| Integration | Purpose | Contract/config |
| --- | --- | --- |
| BSrE eSign API v2 | User status, sign PDF, verify PDF | `ESIGN_URL`, `ESIGN_DEV_URL`, `ESIGN_API_KEY` |
| BSrE portal | Account/certificate sync, passphrase reset | Browser automation + portal REST; shared core in `bsre-sync.ts` |
| BKPSDM | ASN lookup by NIP | Remote lookup with null-safe failure handling |
| WhatsApp gateway | Ticket/credential notifications | `WHATSAPP_HOST`, `WHATSAPP_AUTH`, `WHATSAPP_ADMIN`, `WHATSAPP_NOTIFY_DOCUMENT` |
| Cloudflare Turnstile | Bot protection on registration/signing | `PUBLIC_TURNSTILE_KEY`, `TURNSTILE_SECRET` |
| S3 / RustFS | Primary encrypted object storage | `S3_ENDPOINT`, bucket, credentials; SigV4 |
| Vercel Blob | Retained alternate storage provider | Used when configured by deployment |
| AI gateway | Chatbot and editor assistance | `AI_URL`, `AI_KEY`, `AI_MODEL` |
| External verification portals | Reference links only | `cekdokumen.id`, Komdigi verifyPDF, BSrE BSSN |

---

## 10. Security and privacy requirements

| ID | Requirement |
| --- | --- |
| SEC-01 | BSrE passphrases MUST be transmitted only for the signing operation and MUST NOT be persisted or logged. |
| SEC-02 | Passphrase inputs MUST disable autocomplete. |
| SEC-03 | Stored files MUST be encrypted with AES-256-GCM; legacy CBC MUST remain decryptable for migration only. |
| SEC-04 | Secret-document passcodes MUST be hashed and verified server-side. |
| SEC-05 | JWT secret MUST be configured through `APP_SECRET`; no hard-coded fallback secret in production. |
| SEC-06 | Cookies MUST be HTTP-only, same-site lax and secure in production. |
| SEC-07 | Admin and internal operations MUST enforce server-side role checks. |
| SEC-08 | PII in BSrE admin views MUST be masked by default. |
| SEC-09 | Uploads MUST enforce file count, file size and accepted document types. |
| SEC-10 | Verification failures MUST be explicit; the product MUST NOT claim validity when integrity or trust cannot be established. |
| SEC-11 | Dev-only TLS bypass (`NODE_TLS_REJECT_UNAUTHORIZED=0`) MUST remain confined to the `dev` script. |
| SEC-12 | `csrf.trustedOrigins: ['*']` is currently configured; a production-grade origin policy MUST be adopted before public deployment hardening. |
| SEC-13 | Integrity diagnostic logs required for support (`[Verify]`, `[VerifyDigest]`) MUST be retained in client console output. |

---

## 11. UX and UI requirements

- Use daisyUI semantic color tokens and component classes (`btn`, `card`, `input`, `badge`, `alert`, `table`); avoid raw Tailwind palette colors.
- Use Svelte 5 runes (`$state`, `$derived`, `$effect`) for local reactive state.
- Support light/dark themes via the shared theme state.
- Layout MUST be responsive down to mobile; the sign workspace and verification panel MUST remain usable on tablets and phones.
- The tour overlay MUST stay above modals, allow highlighted elements to be interactive when required, and always expose Skip.
- Modal dialogs MUST be dismissible and MUST not leave orphaned open state after teardown.
- Error states MUST be human-readable Indonesian text where user-facing.
- Accessibility: labels bound to controls, keyboard-operable custom controls, visible focus, Escape-to-dismiss where appropriate.

---

## 12. Non-functional requirements

| Category | Requirement |
| --- | --- |
| Performance | The DOCX editor chain MUST be dynamically imported only when Word editing is opened. Initial `/sign` static chunks MUST NOT include the multi-megabyte editor core. |
| Limits | 500 files, 20 MB/file, 5 concurrent requests and 5 retries by default, configurable via environment. |
| Reliability | Failed external calls MUST produce visible errors and structured logs; BSrE automation failure MUST NOT stop the server. |
| Observability | Application logs, `__logs`, healthcheck, signed/verified counters and integrity diagnostics MUST be available. |
| Internationalization | Paraglide/inlang with `en` base locale and `id` locale; message files under `messages/`. |
| Browser support | Modern evergreen browsers with PDF.js, Web Crypto and native `<dialog>` support. |
| Deployment | Bun adapter when running under Bun outside Vercel; adapter-auto otherwise. |
| Build | Build MUST run changelog generation before Vite build; git SHA is used as the SvelteKit version. |
| Testing | Unit tests via Vitest; changelog parser has a dedicated spec. |
| Maintainability | No dead debug logging in unrelated flows; logs required for verification/integrity are exceptions and MUST stay. |

---

## 13. Technical architecture

- **Framework**: SvelteKit 3, Svelte 5 runes, Vite 8.
- **Styling**: Tailwind CSS 4 + daisyUI 5.
- **Data**: PostgreSQL with Drizzle ORM `1.0.0-rc.4`, query v2, migration journal under `drizzle/`.
- **Auth**: custom JWT + cookie layer around OAuth providers; hooks load `locals.user`.
- **PDF**: `@libpdf/core` for creation/editing/signing, `pdfjs-dist` for preview, `node-forge` for CMS.
- **DOCX**: `@docx-editor.dev/*` packages, lazy-loaded from the sign page.
- **Storage**: `FileStorage` abstraction over S3/RustFS with encryption wrapper.
- **Background work**: `node-cron` with a shared BSrE sync core; started from server hooks.
- **AI**: gateway endpoints under `/api/chat` and `/api/editor-*`.
- **Routing**: `(asta)` main app group, `(_)` internal/utility group; both are URL-transparent.

### 13.1 Engineering constraints

- Use `#lib/...` import aliases as configured in `package.json`.
- Never run `db:push`; only `db:migrate`.
- Do not auto-install or auto-switch adapters; Bun and Vercel behavior is selected in `vite.config.ts`.
- Do not remove UI-facing constants/state (for example `ZOOM_PRESETS`) without explicit product approval.
- Do not remove PDF verify/integrity logging.
- Dev server convention: `bun dev --host --port 7173`.

---

## 14. Deployment and operations

| Item | Detail |
| --- | --- |
| Runtime | Bun 1.3.2 |
| Start | `bun ./build` (script `start`); PM2 script `serve` |
| Build | `bun run build` → changelog build → Vite build → `fix.sh` |
| Health | `GET /healthcheck` |
| Migrations | `bun run db:migrate` |
| Cron | `bun run cron`, also started from server hooks |
| Storage migration | `bun run migrate:storage` |
| History migration | `bun run migrate:histories` |
| Seeding | `bun run db:seed` |
| Version/changelog | `CHANGELOG.md` is source of truth; generated block lives in `src/lib/app/changelog.svelte.ts` |
| Quality gates | `bun run check`, `bun run test` |

Known operational limitation: `/sign` short-link token storage is in-memory and marked temporary. It is unsafe across restarts and multiple instances; a shared store is required before horizontal scaling.

---

## 15. Success metrics

| Metric | Source |
| --- | --- |
| Signed documents, total and today | `document_statistics`, public/admin dashboards |
| Verified documents, total and today | `document_statistics` |
| Signing mode split (`esign` vs `manual`) | `document_statistics`, `/main` |
| New requests, email resets, passphrase resets | `document_statistics`, helpdesk |
| Daily users, signers, documents, tickets, surveys | `daily_statistics` view |
| Helpdesk SLA/stage distribution | `helpdesk`, `helpdesk_events` |
| Survey rating average | `survey_responses`, `helpdesk_surveys` |
| Failed external calls | Application logs, `__logs` |

---

## 16. Dependencies and assumptions

- BSrE eSign API credentials and reachable endpoint are available for TTE mode.
- BSSN portal credentials and a browser automation endpoint are available for sync.
- PostgreSQL, S3/RustFS and an AI gateway endpoint are available in the target environment.
- Turnstile keys are configured for public forms.
- The signing certificate chain and root CA files under `certificates/` are provisioned and trusted by verifiers.
- Users accept that local self-signed mode is not equivalent to BSrE TTE for legal trust purposes.
- Local development may use `/auth/auto-login` and a local RustFS bucket; these are not production assumptions.

---

## 17. Risks and open issues

| ID | Issue | Impact | Recommended action |
| --- | --- | --- | --- |
| OI-01 | `/main` lacks a route-level admin guard despite documentation claiming 403 protection | Privilege escalation risk | Add `(asta)/main/+layout.server.ts` role check |
| OI-02 | Verification stats default unknown checksums to `esign` | Misleading adoption metrics | Store or derive signing mode reliably at verification time |
| OI-03 | `/sign` short-link token store is in-memory and deletes after 1 minute | Links break on restart/multi-instance; comment/behavior mismatch | Move to DB/cache store and align TTL |
| OI-04 | `csrf.trustedOrigins: ['*']` | CSRF exposure in production | Configure explicit trusted origins |
| OI-05 | Legacy AES-CBC fallback remains | Long-term cryptographic debt | Complete migration to GCM and remove fallback when safe |
| OI-06 | Local CMS verifier has unsupported subfilter handling | Some valid signatures may be uninspectable locally | Extend verifier or clearly report unsupported state |
| OI-07 | Browser automation depends on external Chrome/Brave remote debugging and a patched Playwright dependency | BSrE sync can be unavailable | Make the dependency optional with explicit health reporting |
| OI-08 | `db:seed -- all` crashes because `pppk.ts` exports an array instead of a default function | Seeding incomplete | Fix seed data module shape |
| OI-09 | AI prompt text is duplicated in `ai.ts` and `api/chat` with different content | Support answers may drift | Consolidate deliberately, not mechanically |

---

## 18. Release acceptance criteria

A release of Tapak Astà is acceptable when:

1. `bun run check` reports 0 errors and 0 warnings.
2. `bun run build` succeeds with the intended adapter and no unexpected target warnings.
3. Migration from the previous schema succeeds with `bun run db:migrate`.
4. Guest can sign a PDF in both TTE and self-signed modes using valid test credentials/certificates.
5. Guest can verify a signed PDF by file, ID and QR, and can see local integrity diagnostics.
6. DOCX can be created, edited, saved and converted without the editor loading on plain PDF visits.
7. Tour skip works on every `/sign` step, including modal steps, and stays dismissed.
8. Helpdesk ticket creation, lookup, admin processing and survey complete end-to-end.
9. Admin dashboards and BSrE portal views load without exposing unmasked PII.
10. No passphrase, raw document passcode or secret appears in logs, database, cookies or localStorage.
11. `/healthcheck` returns healthy and background sync failures do not stop the server.
12. `CHANGELOG.md` and the in-app "Apa yang Baru" popup agree after `bun run changelog:build`.

---

## 19. Future considerations (not committed)

- Replace in-memory `/sign` short-link storage with a shared persistent store.
- Harden CSRF origin configuration and route-level admin guards.
- Add explicit signing-mode metadata to verification results.
- Consolidate AI prompts and add answer-evaluation tests.
- Publish a machine-readable API contract for the integration playground.
- Add automated end-to-end coverage for signing, verification and tour skip.
- Remove legacy CBC support after all stored data is confirmed GCM.
- Consider audit-trail export for compliance reviews.

---

## 20. References

- `CHANGELOG.md` — release history and audience/page conventions.
- `src/routes/**` — current route surface.
- `src/lib/server/db/schema.ts` — data model source of truth.
- `src/lib/remotes/**` — application-facing operations.
- `src/lib/server/plugins/esign.ts` — BSrE eSign API integration.
- `src/routes/(asta)/integrasi/+page.svelte` — integration requirements and constraints.
- `package.json`, `vite.config.ts`, `drizzle.config.ts` — runtime, build and database configuration.
