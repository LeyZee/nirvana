-- Circuit breaker of the connectors (P0-06, connectors.md): failed polls in a row and the end of the pause.
ALTER TABLE "platform_accounts" ADD COLUMN "consecutive_errors" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_accounts" ADD COLUMN "paused_until" timestamp with time zone;