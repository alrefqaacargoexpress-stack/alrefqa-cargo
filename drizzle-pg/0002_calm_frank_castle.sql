ALTER TABLE "users" ADD COLUMN "publicPhone" varchar(40);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "publicPhoneVisible" boolean DEFAULT false NOT NULL;