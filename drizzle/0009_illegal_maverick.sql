CREATE TABLE "generation_frame" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"index" integer NOT NULL,
	"shot_spec" jsonb,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"image_url" text,
	"identity_score" real,
	"quality_score" real,
	"fail_reason" varchar(16),
	"candidates_tried" integer DEFAULT 0 NOT NULL,
	"is_cover" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"raw_prompt" text,
	"safe_prompt" text,
	"rewrite_applied" boolean DEFAULT false NOT NULL,
	"rewrite_reason" varchar(40) DEFAULT 'none' NOT NULL,
	"moderation_status" varchar(16) DEFAULT 'not_checked' NOT NULL,
	"moderation_reason" text,
	"scene_plan" jsonb,
	"selfie_url" text,
	"identity_ref" jsonb,
	"shot_count" integer DEFAULT 4 NOT NULL,
	"aspect_ratio" varchar(8) DEFAULT '4:5' NOT NULL,
	"credits_cost" integer DEFAULT 0 NOT NULL,
	"tier" varchar(8) DEFAULT 'free' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "generation_frame" ADD CONSTRAINT "generation_frame_job_id_generation_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_frame_job_idx" ON "generation_frame" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "generation_job_user_idx" ON "generation_job" USING btree ("user_id");