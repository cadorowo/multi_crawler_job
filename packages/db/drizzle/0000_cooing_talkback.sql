CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."ats_provider" AS ENUM('greenhouse', 'lever', 'ashby', 'teamtailor', 'factorial', 'workable', 'smartrecruiters', 'recruitee', 'personio', 'workday', 'custom', 'other');--> statement-breakpoint
CREATE TYPE "public"."interaction_status" AS ENUM('discovered', 'notified', 'viewed', 'saved', 'applied', 'interviewing', 'offered', 'rejected', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('active', 'expired', 'deleted', 'draft', 'archived');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('internship', 'working_student', 'graduate', 'junior', 'entry_level', 'trainee', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."user_feedback" AS ENUM('thumbs_up', 'thumbs_down', 'irrelevant_role', 'irrelevant_location', 'underqualified', 'overqualified', 'not_interested_company', 'salary_too_low');--> statement-breakpoint
CREATE TYPE "public"."workplace_type" AS ENUM('remote', 'hybrid', 'onsite', 'unknown');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" text NOT NULL,
	"telegram_username" text,
	"telegram_chat_id" text,
	"full_name" text,
	"email" text,
	"profile" jsonb DEFAULT '{"targetRoles":[],"disciplines":[],"skills":[],"languages":[],"preferredLocations":[],"contractTypes":[],"remotePreference":"any","visaRequired":false}'::jsonb NOT NULL,
"preferences" jsonb DEFAULT '{"notificationFrequency":"instant","minScoreThreshold":0.65,"telegramNotificationsEnabled":true,"hardFilters":{"mustMatchPreferredLocations":true,"requirePaidOnly":false}}'::jsonb NOT NULL,
	"embedding" vector(1536),
	"is_active" boolean DEFAULT true NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"website" text,
	"careers_url" text,
	"ats_provider" "ats_provider" DEFAULT 'other' NOT NULL,
	"ats_identifier" text,
	"ats_api_endpoint" text,
	"location" text DEFAULT 'Barcelona, Spain' NOT NULL,
	"is_barcelona_hq" boolean DEFAULT false NOT NULL,
	"has_barcelona_office" boolean DEFAULT true NOT NULL,
	"industry" text,
	"tier" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_scraped_at" timestamp with time zone,
	"scrape_error_count" integer DEFAULT 0 NOT NULL,
	"last_scrape_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"external_id" text,
	"fingerprint" text NOT NULL,
	"title" text NOT NULL,
	"normalized_title" text,
	"url" text NOT NULL,
	"canonical_url" text,
	"alternate_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"location_raw" text,
	"normalized_location" text DEFAULT 'Barcelona, Spain',
	"is_barcelona" boolean DEFAULT true NOT NULL,
	"workplace_type" "workplace_type" DEFAULT 'unknown' NOT NULL,
	"job_type" "job_type" DEFAULT 'internship' NOT NULL,
	"department" text,
	"description_html" text,
	"description_text" text NOT NULL,
	"summary" text,
	"requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"salary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"classification" jsonb DEFAULT '{"requiredTools":[],"keyTasks":[]}'::jsonb NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"embedding" vector(1536),
	"status" "job_status" DEFAULT 'active' NOT NULL,
	"posted_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "user_job_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"match_score" double precision DEFAULT 0 NOT NULL,
	"semantic_score" double precision,
	"deterministic_score" double precision,
	"match_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"match_analysis" jsonb,
	"status" "interaction_status" DEFAULT 'discovered' NOT NULL,
	"user_notes" text,
	"user_feedback" "user_feedback",
	"feedback_text" text,
	"notified_at" timestamp with time zone,
	"interacted_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_job_interactions" ADD CONSTRAINT "user_job_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_job_interactions" ADD CONSTRAINT "user_job_interactions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_telegram_id_idx" ON "users" USING btree ("telegram_id");--> statement-breakpoint
CREATE INDEX "users_is_active_idx" ON "users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "companies_slug_idx" ON "companies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "companies_ats_provider_idx" ON "companies" USING btree ("ats_provider");--> statement-breakpoint
CREATE INDEX "companies_tier_idx" ON "companies" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "companies_is_active_idx" ON "companies" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "jobs_company_id_idx" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "jobs_fingerprint_idx" ON "jobs" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_job_type_idx" ON "jobs" USING btree ("job_type");--> statement-breakpoint
CREATE INDEX "jobs_is_barcelona_idx" ON "jobs" USING btree ("is_barcelona");--> statement-breakpoint
CREATE INDEX "jobs_first_seen_at_idx" ON "jobs" USING btree ("first_seen_at");--> statement-breakpoint
CREATE INDEX "jobs_embedding_hnsw_idx" ON "jobs" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "user_job_interactions_user_job_unique" ON "user_job_interactions" USING btree ("user_id","job_id");--> statement-breakpoint
CREATE INDEX "user_job_interactions_user_id_idx" ON "user_job_interactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_job_interactions_job_id_idx" ON "user_job_interactions" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "user_job_interactions_status_idx" ON "user_job_interactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_job_interactions_match_score_idx" ON "user_job_interactions" USING btree ("match_score");
