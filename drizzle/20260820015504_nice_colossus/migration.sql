ALTER TABLE "templates" DROP CONSTRAINT "templates_organization_id_organizations_id_fkey";--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "to" json;--> statement-breakpoint
UPDATE "templates" SET "organization_id" = CASE WHEN "organization_id" IS NOT NULL AND "organization_id" != '' THEN ('["' || "organization_id" || '"]') ELSE '[]' END;--> statement-breakpoint
ALTER TABLE "templates" ALTER COLUMN "organization_id" SET DATA TYPE json USING "organization_id"::json;