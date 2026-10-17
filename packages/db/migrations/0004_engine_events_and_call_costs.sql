-- Engine follow-up of P0-05: event type `reply_skipped` (type checks widened, nothing removed). `llm_calls` becomes the
-- gateway journal: `status` takes the twelve gateway outcomes, the exact cost goes to `cost_micro_usd`, the fallback
-- flag is kept, and the foreign key to `drafts` goes (calls are logged before the draft exists, and a held answer
-- writes none). No data is touched.
ALTER TABLE "conversation_events" DROP CONSTRAINT "conversation_events_type_check";--> statement-breakpoint
ALTER TABLE "domain_events" DROP CONSTRAINT "domain_events_type_check";--> statement-breakpoint
ALTER TABLE "llm_calls" DROP CONSTRAINT "llm_calls_status_check";--> statement-breakpoint
ALTER TABLE "llm_calls" DROP CONSTRAINT "llm_calls_draft_id_drafts_id_fk";
--> statement-breakpoint
ALTER TABLE "llm_calls" ADD COLUMN "cost_micro_usd" bigint;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD COLUMN "is_fallback" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_type_check" CHECK ("conversation_events"."type" in ('message_received', 'message_sent', 'send_attempted', 'send_failed', 'send_verified', 'media_described', 'draft_created', 'draft_approved', 'draft_edited', 'draft_rejected', 'draft_expired', 'fact_proposed', 'fact_confirmed', 'fact_rejected', 'summary_refreshed', 'handoff_requested', 'reply_skipped', 'takeover_started', 'takeover_ended', 'mode_changed', 'kill_switch_toggled', 'follow_up_scheduled', 'follow_up_cancelled', 'offer_made', 'sale_detected', 'script_started', 'script_step_sent', 'script_ended', 'session_state_changed', 'error'));--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_type_check" CHECK ("domain_events"."type" in ('message_received', 'message_sent', 'send_attempted', 'send_failed', 'send_verified', 'media_described', 'draft_created', 'draft_approved', 'draft_edited', 'draft_rejected', 'draft_expired', 'fact_proposed', 'fact_confirmed', 'fact_rejected', 'summary_refreshed', 'handoff_requested', 'reply_skipped', 'takeover_started', 'takeover_ended', 'mode_changed', 'kill_switch_toggled', 'follow_up_scheduled', 'follow_up_cancelled', 'offer_made', 'sale_detected', 'script_started', 'script_step_sent', 'script_ended', 'session_state_changed', 'error'));--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_status_check" CHECK ("llm_calls"."status" in ('ok', 'invalid_output', 'refused', 'timeout', 'rate_limited', 'auth', 'unavailable', 'missing_key', 'unknown_model', 'unsupported_input', 'prompt_leak', 'error'));