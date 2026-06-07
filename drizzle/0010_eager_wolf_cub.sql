CREATE TABLE "partner_api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" varchar(8) NOT NULL,
	"daily_limit" integer DEFAULT 1000 NOT NULL,
	"codes_today" integer DEFAULT 0 NOT NULL,
	"today_resets_at" text NOT NULL,
	"total_generated" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"deactivated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "partner_api_key_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "redemption_code" (
	"code" varchar(12) PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"credits" integer NOT NULL,
	"channel" text,
	"used_by" text,
	"used_at" timestamp,
	"created_by" text NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "redemption_code" ADD CONSTRAINT "redemption_code_used_by_user_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "redemption_code_batch_idx" ON "redemption_code" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "redemption_code_used_by_idx" ON "redemption_code" USING btree ("used_by");