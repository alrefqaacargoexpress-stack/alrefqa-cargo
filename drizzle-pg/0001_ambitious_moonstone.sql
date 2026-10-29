CREATE TABLE "shipment_tracking_events" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"shipmentId" varchar(128) NOT NULL,
	"goodsId" varchar(128),
	"eventType" text NOT NULL,
	"stage" text NOT NULL,
	"status" varchar(128) NOT NULL,
	"actorId" integer NOT NULL,
	"actorName" varchar(320) NOT NULL,
	"actorRole" text NOT NULL,
	"officeId" varchar(32),
	"reason" varchar(500),
	"requestKey" varchar(128) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipment_tracking_events" ADD CONSTRAINT "shipment_tracking_events_actorId_users_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_tracking_events_request_unique" ON "shipment_tracking_events" USING btree ("requestKey");--> statement-breakpoint
CREATE INDEX "shipment_tracking_events_shipment_created_idx" ON "shipment_tracking_events" USING btree ("shipmentId","createdAt");--> statement-breakpoint
CREATE INDEX "shipment_tracking_events_goods_created_idx" ON "shipment_tracking_events" USING btree ("goodsId","createdAt");--> statement-breakpoint
CREATE INDEX "shipment_tracking_events_office_created_idx" ON "shipment_tracking_events" USING btree ("officeId","createdAt");