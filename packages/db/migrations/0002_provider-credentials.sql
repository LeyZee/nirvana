CREATE TABLE "provider_credentials" (
	"provider" text PRIMARY KEY NOT NULL,
	"key_ciphertext" "bytea" NOT NULL,
	"key_version" text NOT NULL,
	"key_label" text,
	"state" text NOT NULL,
	"summary" text NOT NULL,
	"facts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"voices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"characters_left" integer,
	"last_error_kind" text,
	"verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_credentials_provider_check" CHECK ("provider_credentials"."provider" in ('xai', 'google', 'elevenlabs', 'mistral', 'venice')),
	CONSTRAINT "provider_credentials_state_check" CHECK ("provider_credentials"."state" in ('connected', 'low_credit', 'needs_reconnect')),
	CONSTRAINT "provider_credentials_last_error_kind_check" CHECK ("provider_credentials"."last_error_kind" in ('too_short', 'wrong_provider', 'unauthorized', 'model_not_allowed', 'no_credit', 'api_not_enabled', 'vision_model_missing', 'missing_permission', 'unreachable'))
);
--> statement-breakpoint
-- AI service keys (ADR 0016): read and written through withAdmin only. The default privileges of init.sql would
-- hand DML to the application role; this table keeps it out.
REVOKE ALL ON "provider_credentials" FROM nirvana_app;
