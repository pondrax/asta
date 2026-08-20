ALTER TABLE "templates" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "sign_type" text;--> statement-breakpoint
UPDATE "templates" SET "description" = "properties"->>'description', "sign_type" = "properties"->>'type';--> statement-breakpoint
ALTER TABLE "templates" DROP COLUMN "properties";