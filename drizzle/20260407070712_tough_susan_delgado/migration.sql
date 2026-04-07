CREATE TABLE "__logs" (
	"id" text PRIMARY KEY,
	"level" text DEFAULT 'info',
	"url" text,
	"method" text,
	"message" text,
	"metadata" json,
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "document_statistics" (
	"id" text PRIMARY KEY,
	"type" text DEFAULT 'signed',
	"value" integer DEFAULT 0,
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY,
	"owner" text,
	"signer" text,
	"title" text,
	"files" text[],
	"signatures" text[],
	"checksums" text[],
	"metadata" text,
	"status" text DEFAULT 'draft',
	"esign" boolean DEFAULT true,
	"signature_properties" json,
	"to" text[],
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY,
	"name" text UNIQUE,
	"short_name" text UNIQUE,
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY,
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now(),
	"title" text,
	"content" text,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "ranks" (
	"id" text PRIMARY KEY,
	"rank" text UNIQUE,
	"grade" text UNIQUE,
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY,
	"name" text UNIQUE,
	"description" text,
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "signers" (
	"id" text PRIMARY KEY,
	"nik" text UNIQUE,
	"nip" text,
	"email" text UNIQUE,
	"name" text,
	"position" text,
	"rank" text,
	"organizations" text,
	"phone" text,
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text PRIMARY KEY,
	"name" text UNIQUE,
	"file" text,
	"properties" json,
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY,
	"email" text UNIQUE,
	"password" text,
	"role_id" text DEFAULT 'member',
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id");