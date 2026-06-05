CREATE TABLE IF NOT EXISTS "__setting" (
	"id" text PRIMARY KEY,
	"key" text UNIQUE,
	"value" text,
	"description" text,
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bsre_users" (
	"id" text PRIMARY KEY,
	"nama" text,
	"email_address" text,
	"username" text,
	"nik" text,
	"nip" text,
	"jabatan_organisasi" text,
	"organisasi_unit" text,
	"organisasi" text,
	"phone" text,
	"status" text,
	"aktif" boolean,
	"certificate_status" text,
	"products" text,
	"created_date" text,
	"registered_origin" text,
	"verified_dukcapil" boolean,
	"verified_liveness" boolean,
	"phone_verified" boolean,
	"verified_verifikator" boolean,
	"details" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_owner_idx" ON "documents" ("owner");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_signer_idx" ON "documents" ("signer");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_checksums_idx" ON "documents" ("checksums");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_esign_idx" ON "documents" ("esign");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_to_idx" ON "documents" ("to");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_status_idx" ON "documents" ("status");