CREATE TABLE "signer_profiles" (
	"id" text PRIMARY KEY,
	"email" text NOT NULL,
	"label" text,
	"nama" text,
	"jabatan" text,
	"pangkat" text,
	"instansi" text,
	"specimen" text,
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "signer_profiles_email_idx" ON "signer_profiles" ("email");