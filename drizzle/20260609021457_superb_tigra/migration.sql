CREATE TABLE "survey_responses" (
	"id" text PRIMARY KEY,
	"rating" integer,
	"feedback" text,
	"created" timestamp with time zone DEFAULT now()
);
