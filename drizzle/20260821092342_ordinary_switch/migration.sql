CREATE TABLE "helpdesk" (
	"id" text PRIMARY KEY,
	"ticket_number" text UNIQUE,
	"service" text,
	"service_type" text,
	"status" text DEFAULT 'open',
	"stage" text DEFAULT 'submitted',
	"subject" text,
	"description" text,
	"requester_name" text,
	"requester_nip" text,
	"requester_nik" text,
	"requester_phone" text,
	"requester_email" text,
	"organization_id" text,
	"parent_id" text,
	"metadata" jsonb,
	"completed_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "helpdesk_attachments" (
	"id" text PRIMARY KEY,
	"helpdesk_id" text NOT NULL,
	"comment_id" text,
	"file_name" text,
	"file_path" text,
	"mime_type" text,
	"size" integer,
	"uploaded_by" text,
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "helpdesk_comments" (
	"id" text PRIMARY KEY,
	"helpdesk_id" text NOT NULL,
	"author_type" text,
	"author_id" text,
	"author_name" text,
	"message" text NOT NULL,
	"is_internal" boolean DEFAULT false,
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "helpdesk_events" (
	"id" text PRIMARY KEY,
	"helpdesk_id" text NOT NULL,
	"event" text,
	"actor_type" text,
	"actor_id" text,
	"metadata" jsonb,
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "helpdesk_notifications" (
	"id" text PRIMARY KEY,
	"helpdesk_id" text NOT NULL,
	"type" text,
	"channel" text DEFAULT 'whatsapp',
	"recipient" text,
	"message" text,
	"status" text DEFAULT 'pending',
	"sent_at" timestamp with time zone,
	"metadata" jsonb,
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "helpdesk_surveys" (
	"id" text PRIMARY KEY,
	"helpdesk_id" text NOT NULL UNIQUE,
	"rating" integer,
	"ease" integer,
	"comment" text,
	"created" timestamp with time zone DEFAULT now(),
	"updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "helpdesk_ticket_number_idx" ON "helpdesk" ("ticket_number");--> statement-breakpoint
CREATE INDEX "helpdesk_status_idx" ON "helpdesk" ("status");--> statement-breakpoint
CREATE INDEX "helpdesk_service_idx" ON "helpdesk" ("service");--> statement-breakpoint
CREATE INDEX "helpdesk_requester_phone_idx" ON "helpdesk" ("requester_phone");--> statement-breakpoint
CREATE INDEX "helpdesk_requester_nik_idx" ON "helpdesk" ("requester_nik");--> statement-breakpoint
CREATE INDEX "helpdesk_attachments_helpdesk_idx" ON "helpdesk_attachments" ("helpdesk_id");--> statement-breakpoint
CREATE INDEX "helpdesk_comments_helpdesk_idx" ON "helpdesk_comments" ("helpdesk_id");--> statement-breakpoint
CREATE INDEX "helpdesk_events_helpdesk_idx" ON "helpdesk_events" ("helpdesk_id");--> statement-breakpoint
CREATE INDEX "helpdesk_notifications_helpdesk_idx" ON "helpdesk_notifications" ("helpdesk_id");--> statement-breakpoint
ALTER TABLE "helpdesk" ADD CONSTRAINT "helpdesk_organization_id_organizations_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id");--> statement-breakpoint
ALTER TABLE "helpdesk_attachments" ADD CONSTRAINT "helpdesk_attachments_helpdesk_id_helpdesk_id_fkey" FOREIGN KEY ("helpdesk_id") REFERENCES "helpdesk"("id");--> statement-breakpoint
ALTER TABLE "helpdesk_attachments" ADD CONSTRAINT "helpdesk_attachments_comment_id_helpdesk_comments_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "helpdesk_comments"("id");--> statement-breakpoint
ALTER TABLE "helpdesk_comments" ADD CONSTRAINT "helpdesk_comments_helpdesk_id_helpdesk_id_fkey" FOREIGN KEY ("helpdesk_id") REFERENCES "helpdesk"("id");--> statement-breakpoint
ALTER TABLE "helpdesk_events" ADD CONSTRAINT "helpdesk_events_helpdesk_id_helpdesk_id_fkey" FOREIGN KEY ("helpdesk_id") REFERENCES "helpdesk"("id");--> statement-breakpoint
ALTER TABLE "helpdesk_notifications" ADD CONSTRAINT "helpdesk_notifications_helpdesk_id_helpdesk_id_fkey" FOREIGN KEY ("helpdesk_id") REFERENCES "helpdesk"("id");--> statement-breakpoint
ALTER TABLE "helpdesk_surveys" ADD CONSTRAINT "helpdesk_surveys_helpdesk_id_helpdesk_id_fkey" FOREIGN KEY ("helpdesk_id") REFERENCES "helpdesk"("id");