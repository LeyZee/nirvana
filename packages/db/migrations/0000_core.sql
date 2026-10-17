CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'operator' NOT NULL,
	"creator_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_role_check" CHECK ("user"."role" in ('owner', 'operator', 'creator'))
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"actor" text NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_events_seq_unique" UNIQUE("conversation_id","seq"),
	CONSTRAINT "conversation_events_type_check" CHECK ("conversation_events"."type" in ('message_received', 'message_sent', 'send_attempted', 'send_failed', 'send_verified', 'media_described', 'draft_created', 'draft_approved', 'draft_edited', 'draft_rejected', 'draft_expired', 'fact_proposed', 'fact_confirmed', 'fact_rejected', 'summary_refreshed', 'handoff_requested', 'takeover_started', 'takeover_ended', 'mode_changed', 'kill_switch_toggled', 'follow_up_scheduled', 'follow_up_cancelled', 'offer_made', 'sale_detected', 'script_started', 'script_step_sent', 'script_ended', 'session_state_changed', 'error'))
);
--> statement-breakpoint
ALTER TABLE "conversation_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"platform_account_id" uuid NOT NULL,
	"fan_id" uuid NOT NULL,
	"platform_conversation_id" text NOT NULL,
	"state" text DEFAULT 'idle' NOT NULL,
	"mode" text DEFAULT 'copilot' NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_at" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"cooldowns" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active_script_run_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_platform_conversation_unique" UNIQUE("platform_account_id","platform_conversation_id"),
	CONSTRAINT "conversations_state_check" CHECK ("conversations"."state" in ('idle', 'pending', 'drafting', 'awaiting_approval', 'sending', 'human', 'paused', 'error')),
	CONSTRAINT "conversations_mode_check" CHECK ("conversations"."mode" in ('copilot', 'auto'))
);
--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"brief" jsonb,
	"bubbles" text[] DEFAULT '{}'::text[] NOT NULL,
	"final_bubbles" text[],
	"persona_version_id" uuid,
	"prompt_hashes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policy_trace" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"guard_trace" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drafts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "drafts_status_check" CHECK ("drafts"."status" in ('pending', 'approved', 'edited', 'rejected', 'sent', 'failed', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"platform_account_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"platform_message_id" text NOT NULL,
	"direction" text NOT NULL,
	"author" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"media_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"price_minor" integer,
	"currency" char(3),
	"is_paid" boolean DEFAULT false NOT NULL,
	"platform_created_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"draft_id" uuid,
	CONSTRAINT "messages_platform_message_unique" UNIQUE("platform_account_id","platform_message_id"),
	CONSTRAINT "messages_direction_check" CHECK ("messages"."direction" in ('inbound', 'outbound')),
	CONSTRAINT "messages_author_check" CHECK ("messages"."author" in ('fan', 'human', 'ai')),
	CONSTRAINT "messages_currency_check" CHECK ("messages"."currency" in ('EUR', 'USD'))
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"actor" text NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_events_type_check" CHECK ("domain_events"."type" in ('message_received', 'message_sent', 'send_attempted', 'send_failed', 'send_verified', 'media_described', 'draft_created', 'draft_approved', 'draft_edited', 'draft_rejected', 'draft_expired', 'fact_proposed', 'fact_confirmed', 'fact_rejected', 'summary_refreshed', 'handoff_requested', 'takeover_started', 'takeover_ended', 'mode_changed', 'kill_switch_toggled', 'follow_up_scheduled', 'follow_up_cancelled', 'offer_made', 'sale_detected', 'script_started', 'script_step_sent', 'script_ended', 'session_state_changed', 'error'))
);
--> statement-breakpoint
ALTER TABLE "domain_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"platform_account_id" uuid NOT NULL,
	"platform_fan_id" text NOT NULL,
	"display_name" text NOT NULL,
	"person_id" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kyc_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"platform_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "fans_platform_fan_unique" UNIQUE("platform_account_id","platform_fan_id")
);
--> statement-breakpoint
ALTER TABLE "fans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid,
	"role" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_minor" integer,
	"currency" char(3),
	"latency_ms" integer NOT NULL,
	"status" text NOT NULL,
	"conversation_id" uuid,
	"draft_id" uuid,
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_calls_role_check" CHECK ("llm_calls"."role" in ('sense', 'brain', 'voice', 'judge')),
	CONSTRAINT "llm_calls_status_check" CHECK ("llm_calls"."status" in ('ok', 'error', 'refused', 'timeout')),
	CONSTRAINT "llm_calls_currency_check" CHECK ("llm_calls"."currency" in ('EUR', 'USD'))
);
--> statement-breakpoint
ALTER TABLE "llm_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"origin" text NOT NULL,
	"fan_id" uuid,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" bigint NOT NULL,
	"duration_ms" integer,
	"sha256" text NOT NULL,
	"rights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_creator_sha256_unique" UNIQUE("creator_id","sha256"),
	CONSTRAINT "media_assets_kind_check" CHECK ("media_assets"."kind" in ('image', 'video', 'audio')),
	CONSTRAINT "media_assets_origin_check" CHECK ("media_assets"."origin" in ('creator', 'fan'))
);
--> statement-breakpoint
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "media_descriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"vocabulary_version" text NOT NULL,
	"content" jsonb NOT NULL,
	"model" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_descriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "media_sends" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"media_asset_id" uuid NOT NULL,
	"fan_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" uuid,
	"price_minor" integer,
	"currency" char(3),
	"sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "media_sends_currency_check" CHECK ("media_sends"."currency" in ('EUR', 'USD'))
);
--> statement-breakpoint
ALTER TABLE "media_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fan_facts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"fan_id" uuid NOT NULL,
	"category" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"kind" text NOT NULL,
	"confidence" real NOT NULL,
	"source_message_id" uuid,
	"observed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"superseded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fan_facts_category_check" CHECK ("fan_facts"."category" in ('identity', 'life', 'interests', 'preferences', 'commercial', 'intimate', 'events')),
	CONSTRAINT "fan_facts_kind_check" CHECK ("fan_facts"."kind" in ('declared', 'inferred')),
	CONSTRAINT "fan_facts_confidence_check" CHECK ("fan_facts"."confidence" between 0 and 1)
);
--> statement-breakpoint
ALTER TABLE "fan_facts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fan_summaries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"fan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"based_on_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fan_summaries_fan_version_unique" UNIQUE("fan_id","version")
);
--> statement-breakpoint
ALTER TABLE "fan_summaries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "persona_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"version" text NOT NULL,
	"source_path" text NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "persona_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "kill_switches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"scope_id" uuid,
	"creator_id" uuid,
	"active" boolean NOT NULL,
	"reason" text NOT NULL,
	"set_by" text NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kill_switches_scope_check" CHECK ("kill_switches"."scope" in ('global', 'creator', 'conversation'))
);
--> statement-breakpoint
ALTER TABLE "kill_switches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "worker_heartbeats" (
	"worker_id" text PRIMARY KEY NOT NULL,
	"hostname" text NOT NULL,
	"version" text NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creators" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"timezone" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"session_state" text DEFAULT 'none' NOT NULL,
	"session_ciphertext" "bytea",
	"session_updated_at" timestamp with time zone,
	"last_poll_at" timestamp with time zone,
	"connector_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_accounts_platform_handle_unique" UNIQUE("platform","handle"),
	CONSTRAINT "platform_accounts_platform_check" CHECK ("platform_accounts"."platform" in ('reveal', 'onlyfans', 'instagram', 'nirvana')),
	CONSTRAINT "platform_accounts_session_state_check" CHECK ("platform_accounts"."session_state" in ('none', 'valid', 'warning', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "platform_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_platform_account_id_platform_accounts_id_fk" FOREIGN KEY ("platform_account_id") REFERENCES "public"."platform_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_fan_id_fans_id_fk" FOREIGN KEY ("fan_id") REFERENCES "public"."fans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_persona_version_id_persona_versions_id_fk" FOREIGN KEY ("persona_version_id") REFERENCES "public"."persona_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_platform_account_id_platform_accounts_id_fk" FOREIGN KEY ("platform_account_id") REFERENCES "public"."platform_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fans" ADD CONSTRAINT "fans_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fans" ADD CONSTRAINT "fans_platform_account_id_platform_accounts_id_fk" FOREIGN KEY ("platform_account_id") REFERENCES "public"."platform_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_fan_id_fans_id_fk" FOREIGN KEY ("fan_id") REFERENCES "public"."fans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_descriptions" ADD CONSTRAINT "media_descriptions_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_descriptions" ADD CONSTRAINT "media_descriptions_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_sends" ADD CONSTRAINT "media_sends_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_sends" ADD CONSTRAINT "media_sends_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_sends" ADD CONSTRAINT "media_sends_fan_id_fans_id_fk" FOREIGN KEY ("fan_id") REFERENCES "public"."fans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_sends" ADD CONSTRAINT "media_sends_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_sends" ADD CONSTRAINT "media_sends_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_facts" ADD CONSTRAINT "fan_facts_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_facts" ADD CONSTRAINT "fan_facts_fan_id_fans_id_fk" FOREIGN KEY ("fan_id") REFERENCES "public"."fans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_facts" ADD CONSTRAINT "fan_facts_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_facts" ADD CONSTRAINT "fan_facts_superseded_by_fan_facts_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."fan_facts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_summaries" ADD CONSTRAINT "fan_summaries_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_summaries" ADD CONSTRAINT "fan_summaries_fan_id_fans_id_fk" FOREIGN KEY ("fan_id") REFERENCES "public"."fans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fan_summaries" ADD CONSTRAINT "fan_summaries_based_on_message_id_messages_id_fk" FOREIGN KEY ("based_on_message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona_versions" ADD CONSTRAINT "persona_versions_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kill_switches" ADD CONSTRAINT "kill_switches_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_events_type_created_idx" ON "conversation_events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "conversations_account_state_idx" ON "conversations" USING btree ("platform_account_id","state");--> statement-breakpoint
CREATE INDEX "conversations_creator_last_inbound_idx" ON "conversations" USING btree ("creator_id","last_inbound_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "drafts_conversation_idx" ON "drafts" USING btree ("conversation_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","platform_created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "domain_events_created_idx" ON "domain_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "fans_creator_idx" ON "fans" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "llm_calls_creator_created_idx" ON "llm_calls" USING btree ("creator_id","created_at");--> statement-breakpoint
CREATE INDEX "media_descriptions_asset_idx" ON "media_descriptions" USING btree ("media_asset_id");--> statement-breakpoint
CREATE INDEX "media_sends_fan_media_idx" ON "media_sends" USING btree ("fan_id","media_asset_id");--> statement-breakpoint
CREATE INDEX "fan_facts_active_idx" ON "fan_facts" USING btree ("fan_id") WHERE "fan_facts"."superseded_by" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "persona_versions_creator_version_unique" ON "persona_versions" USING btree ("creator_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "persona_versions_one_active" ON "persona_versions" USING btree ("creator_id") WHERE "persona_versions"."is_active";--> statement-breakpoint
CREATE INDEX "kill_switches_scope_idx" ON "kill_switches" USING btree ("scope","scope_id");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "platform_accounts_creator_idx" ON "platform_accounts" USING btree ("creator_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "conversation_events" AS PERMISSIVE FOR ALL TO public USING ("conversation_events"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("conversation_events"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "conversations" AS PERMISSIVE FOR ALL TO public USING ("conversations"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("conversations"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "drafts" AS PERMISSIVE FOR ALL TO public USING ("drafts"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("drafts"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "messages" AS PERMISSIVE FOR ALL TO public USING ("messages"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("messages"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "domain_events" AS PERMISSIVE FOR ALL TO public USING ("domain_events"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("domain_events"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "fans" AS PERMISSIVE FOR ALL TO public USING ("fans"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("fans"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "llm_calls" AS PERMISSIVE FOR ALL TO public USING ("llm_calls"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("llm_calls"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "media_assets" AS PERMISSIVE FOR ALL TO public USING ("media_assets"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("media_assets"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "media_descriptions" AS PERMISSIVE FOR ALL TO public USING ("media_descriptions"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("media_descriptions"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "media_sends" AS PERMISSIVE FOR ALL TO public USING ("media_sends"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("media_sends"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "fan_facts" AS PERMISSIVE FOR ALL TO public USING ("fan_facts"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("fan_facts"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "fan_summaries" AS PERMISSIVE FOR ALL TO public USING ("fan_summaries"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("fan_summaries"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "persona_versions" AS PERMISSIVE FOR ALL TO public USING ("persona_versions"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("persona_versions"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "kill_switches" AS PERMISSIVE FOR ALL TO public USING ("kill_switches"."creator_id" is null or "kill_switches"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("kill_switches"."creator_id" is null or "kill_switches"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "notifications" AS PERMISSIVE FOR ALL TO public USING ("notifications"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("notifications"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "platform_accounts" AS PERMISSIVE FOR ALL TO public USING ("platform_accounts"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("platform_accounts"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
-- Added by hand after `drizzle-kit generate` (ADR 0005, data-model.md § RLS). Requires the roles nirvana_admin
-- (owner, runs the migrations) and nirvana_app (NOSUPERUSER NOBYPASSRLS), created by docker/init.sql in dev and by
-- the runbook in production.
-- FORCE: the policies also apply to the table owner, unless it has BYPASSRLS (withAdmin, *Unscoped jobs).
ALTER TABLE "platform_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fans" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fan_facts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fan_summaries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversation_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "domain_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drafts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "persona_versions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media_assets" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media_descriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media_sends" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "llm_calls" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kill_switches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Append-only journals (ADR 0007): no UPDATE, no DELETE, whoever asks. Erasing a fan (security.md) will go
-- through a dedicated migration-defined path, not around this trigger.
CREATE FUNCTION "refuse_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "conversation_events_append_only" BEFORE UPDATE OR DELETE ON "conversation_events"
  FOR EACH ROW EXECUTE FUNCTION "refuse_change"();--> statement-breakpoint
CREATE TRIGGER "domain_events_append_only" BEFORE UPDATE OR DELETE ON "domain_events"
  FOR EACH ROW EXECUTE FUNCTION "refuse_change"();--> statement-breakpoint
CREATE TRIGGER "audit_log_append_only" BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "refuse_change"();--> statement-breakpoint
-- The application role only gets DML, never ownership (an owner without FORCE would skip RLS).
GRANT USAGE ON SCHEMA public TO nirvana_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nirvana_app;
