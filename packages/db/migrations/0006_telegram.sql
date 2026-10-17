-- Telegram notifications (ADR 0020, task P3-07): bots, the groups they sit in, routing, deliveries. Agency settings,
-- out of RLS, read and written through withAdmin only by the `telegram` module.
CREATE TABLE "telegram_bots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"telegram_bot_id" text NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"token_ciphertext" "bytea" NOT NULL,
	"key_version" text NOT NULL,
	"state" text NOT NULL,
	"updates_offset" bigint DEFAULT 0 NOT NULL,
	"last_polled_at" timestamp with time zone,
	"last_poll_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_bots_telegram_bot_id_unique" UNIQUE("telegram_bot_id"),
	CONSTRAINT "telegram_bots_state_check" CHECK ("telegram_bots"."state" in ('active', 'refused', 'conflict')),
	CONSTRAINT "telegram_bots_last_poll_error_check" CHECK ("telegram_bots"."last_poll_error" in ('token_shape', 'token_refused', 'bot_exists', 'bot_mismatch', 'bot_conflict', 'chat_unreachable', 'rate_limited', 'unreachable', 'routes_version_conflict'))
);
--> statement-breakpoint
CREATE TABLE "telegram_chats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bot_id" uuid NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"membership" text NOT NULL,
	"can_post" boolean NOT NULL,
	"next_send_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"last_error_kind" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_chats_bot_chat_unique" UNIQUE("bot_id","telegram_chat_id"),
	CONSTRAINT "telegram_chats_kind_check" CHECK ("telegram_chats"."kind" in ('group', 'supergroup', 'channel')),
	CONSTRAINT "telegram_chats_membership_check" CHECK ("telegram_chats"."membership" in ('member', 'left', 'kicked')),
	CONSTRAINT "telegram_chats_last_error_kind_check" CHECK ("telegram_chats"."last_error_kind" in ('token_shape', 'token_refused', 'bot_exists', 'bot_mismatch', 'bot_conflict', 'chat_unreachable', 'rate_limited', 'unreachable', 'routes_version_conflict'))
);
--> statement-breakpoint
CREATE TABLE "telegram_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"chat_id" uuid NOT NULL,
	"creator_id" uuid,
	"topic" text NOT NULL,
	"action" text NOT NULL,
	"parent_id" uuid,
	"thread_key" text,
	"text" text NOT NULL,
	"summary" text NOT NULL,
	"is_silent" boolean NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"telegram_message_id" bigint,
	"error_kind" text,
	"closed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "telegram_deliveries_source_chat_unique" UNIQUE("source_key","chat_id"),
	CONSTRAINT "telegram_deliveries_topic_check" CHECK ("telegram_deliveries"."topic" in ('urgent', 'important', 'info', 'sale', 'keyword', 'validation')),
	CONSTRAINT "telegram_deliveries_action_check" CHECK ("telegram_deliveries"."action" in ('send', 'edit', 'reply')),
	CONSTRAINT "telegram_deliveries_status_check" CHECK ("telegram_deliveries"."status" in ('pending', 'sending', 'sent', 'failed', 'unknown')),
	CONSTRAINT "telegram_deliveries_error_kind_check" CHECK ("telegram_deliveries"."error_kind" in ('token_shape', 'token_refused', 'bot_exists', 'bot_mismatch', 'bot_conflict', 'chat_unreachable', 'rate_limited', 'unreachable', 'routes_version_conflict'))
);
--> statement-breakpoint
CREATE TABLE "telegram_routes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid,
	"topic" text NOT NULL,
	"chat_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_routes_unique" UNIQUE NULLS NOT DISTINCT("creator_id","topic","chat_id"),
	CONSTRAINT "telegram_routes_topic_check" CHECK ("telegram_routes"."topic" in ('urgent', 'important', 'info', 'sale', 'keyword', 'validation'))
);
--> statement-breakpoint
CREATE TABLE "telegram_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"scan_cursor" timestamp with time zone NOT NULL,
	"routes_version" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_events" DROP CONSTRAINT "conversation_events_type_check";--> statement-breakpoint
ALTER TABLE "domain_events" DROP CONSTRAINT "domain_events_type_check";--> statement-breakpoint
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_bot_id_telegram_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."telegram_bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_deliveries" ADD CONSTRAINT "telegram_deliveries_chat_id_telegram_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."telegram_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_deliveries" ADD CONSTRAINT "telegram_deliveries_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_routes" ADD CONSTRAINT "telegram_routes_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_routes" ADD CONSTRAINT "telegram_routes_chat_id_telegram_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."telegram_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "telegram_deliveries_chat_status_idx" ON "telegram_deliveries" USING btree ("chat_id","status","run_after");--> statement-breakpoint
CREATE INDEX "telegram_deliveries_thread_idx" ON "telegram_deliveries" USING btree ("thread_key");--> statement-breakpoint
CREATE INDEX "telegram_deliveries_created_idx" ON "telegram_deliveries" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_type_check" CHECK ("conversation_events"."type" in ('message_received', 'message_sent', 'send_attempted', 'send_failed', 'send_verified', 'media_described', 'draft_created', 'draft_approved', 'draft_edited', 'draft_rejected', 'draft_expired', 'fact_proposed', 'fact_confirmed', 'fact_rejected', 'summary_refreshed', 'handoff_requested', 'reply_skipped', 'takeover_started', 'takeover_ended', 'mode_changed', 'kill_switch_toggled', 'follow_up_scheduled', 'follow_up_cancelled', 'offer_made', 'sale_detected', 'script_started', 'script_step_sent', 'script_ended', 'session_state_changed', 'budget_threshold_crossed', 'error'));--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_type_check" CHECK ("domain_events"."type" in ('message_received', 'message_sent', 'send_attempted', 'send_failed', 'send_verified', 'media_described', 'draft_created', 'draft_approved', 'draft_edited', 'draft_rejected', 'draft_expired', 'fact_proposed', 'fact_confirmed', 'fact_rejected', 'summary_refreshed', 'handoff_requested', 'reply_skipped', 'takeover_started', 'takeover_ended', 'mode_changed', 'kill_switch_toggled', 'follow_up_scheduled', 'follow_up_cancelled', 'offer_made', 'sale_detected', 'script_started', 'script_step_sent', 'script_ended', 'session_state_changed', 'budget_threshold_crossed', 'error'));
--> statement-breakpoint
-- Added by hand after `drizzle-kit generate`. The default privileges of init.sql would hand DML to the application
-- role; these tables keep it out (a bot token is a secret of the agency, ADR 0020 §5).
REVOKE ALL ON "telegram_bots", "telegram_chats", "telegram_routes", "telegram_deliveries", "telegram_state" FROM nirvana_app;--> statement-breakpoint
INSERT INTO "telegram_state" ("id", "scan_cursor") VALUES (1, now());--> statement-breakpoint
-- A consumed event enqueues the scan as soon as its transaction commits (ADR 0020 §7); a burst gives one scan
-- (job key). Runs as the caller (`nirvana_app` holds EXECUTE on enqueue_job). Before Graphile has created its schema
-- (fresh database, tests), it does nothing. A notification must never undo the agent's own write: any failure here is
-- swallowed with a warning, and the minute cron catches up.
CREATE FUNCTION "telegram_enqueue_scan"() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF to_regnamespace('graphile_worker') IS NOT NULL THEN
    PERFORM public.enqueue_job('telegram.scan', '{}'::jsonb, 'telegram', NULL, 25, 'telegram.scan', 'preserve_run_at');
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'telegram_enqueue_scan: %', SQLERRM;
  RETURN NULL;
END;
$$;--> statement-breakpoint
-- The list mirrors SCANNED_EVENT_TYPES (module telegram, domain/classify.ts); a test compares them.
CREATE TRIGGER "domain_events_telegram_scan" AFTER INSERT ON "domain_events"
  FOR EACH ROW
  WHEN (NEW.type IN ('handoff_requested', 'budget_threshold_crossed', 'session_state_changed', 'kill_switch_toggled', 'takeover_started', 'sale_detected', 'keyword_matched', 'validation_requested', 'validation_resolved'))
  EXECUTE FUNCTION "telegram_enqueue_scan"();
