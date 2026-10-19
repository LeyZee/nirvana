-- The server lock of Automatique (ADR 0019, revue 09 B3): the blind tests the owner records, one row per run, and the
-- `automatic_closed` event when Automatique closes on its own. Additive: a new table and one more event type.
CREATE TABLE "blind_tests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"voice_prompt" text NOT NULL,
	"voice_model" text NOT NULL,
	"rate_per_mille" integer NOT NULL,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blind_tests_rate_check" CHECK ("blind_tests"."rate_per_mille" between 0 and 1000)
);
--> statement-breakpoint
ALTER TABLE "blind_tests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversation_events" DROP CONSTRAINT "conversation_events_type_check";--> statement-breakpoint
ALTER TABLE "domain_events" DROP CONSTRAINT "domain_events_type_check";--> statement-breakpoint
ALTER TABLE "blind_tests" ADD CONSTRAINT "blind_tests_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blind_tests_version_idx" ON "blind_tests" USING btree ("creator_id","voice_prompt","voice_model","recorded_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_type_check" CHECK ("conversation_events"."type" in ('message_received', 'message_sent', 'send_attempted', 'send_failed', 'send_verified', 'media_described', 'draft_created', 'draft_approved', 'draft_edited', 'draft_rejected', 'draft_expired', 'fact_proposed', 'fact_confirmed', 'fact_rejected', 'summary_refreshed', 'handoff_requested', 'reply_skipped', 'takeover_started', 'takeover_ended', 'mode_changed', 'kill_switch_toggled', 'follow_up_scheduled', 'follow_up_cancelled', 'offer_made', 'sale_detected', 'script_started', 'script_step_sent', 'script_ended', 'session_state_changed', 'budget_threshold_crossed', 'automatic_closed', 'error'));--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_type_check" CHECK ("domain_events"."type" in ('message_received', 'message_sent', 'send_attempted', 'send_failed', 'send_verified', 'media_described', 'draft_created', 'draft_approved', 'draft_edited', 'draft_rejected', 'draft_expired', 'fact_proposed', 'fact_confirmed', 'fact_rejected', 'summary_refreshed', 'handoff_requested', 'reply_skipped', 'takeover_started', 'takeover_ended', 'mode_changed', 'kill_switch_toggled', 'follow_up_scheduled', 'follow_up_cancelled', 'offer_made', 'sale_detected', 'script_started', 'script_step_sent', 'script_ended', 'session_state_changed', 'budget_threshold_crossed', 'automatic_closed', 'error'));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "blind_tests" AS PERMISSIVE FOR ALL TO public USING ("blind_tests"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("blind_tests"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
-- Added by hand after `drizzle-kit generate` (ADR 0005, data-model.md § RLS). A blind test is a fact of the past:
-- recorded once, never changed nor removed by the application.
ALTER TABLE "blind_tests" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT ON "blind_tests" TO nirvana_app;--> statement-breakpoint
REVOKE UPDATE, DELETE ON "blind_tests" FROM nirvana_app;
