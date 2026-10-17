-- The playground's ratings move from a JSONL file to the database (calibration, module `agent`): one row per rating,
-- under RLS like every tenant table. Append-only, with a single exception: `moment` (the conversation as it was) may
-- be purged after 90 days, by setting it to null with `moment_purged_at`. The verdict and the version stay for good.
CREATE TABLE "calibration_ratings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"creator_id" uuid NOT NULL,
	"session_id" text NOT NULL,
	"rated_at" timestamp with time zone NOT NULL,
	"voice_prompt" text NOT NULL,
	"voice_model" text NOT NULL,
	"verdict_kind" text NOT NULL,
	"verdict" jsonb NOT NULL,
	"destination" text,
	"fan_message" text NOT NULL,
	"bubbles" jsonb NOT NULL,
	"moment" jsonb,
	"moment_purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calibration_ratings_verdict_kind_check" CHECK ("calibration_ratings"."verdict_kind" in ('validated', 'corrected', 'rejected')),
	CONSTRAINT "calibration_ratings_destination_check" CHECK ("calibration_ratings"."destination" in ('voice_example', 'rule', 'test')),
	CONSTRAINT "calibration_ratings_moment_purge_check" CHECK (("calibration_ratings"."moment" is null) = ("calibration_ratings"."moment_purged_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "calibration_ratings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "calibration_ratings" ADD CONSTRAINT "calibration_ratings_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calibration_ratings_creator_at_idx" ON "calibration_ratings" USING btree ("creator_id","rated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "calibration_ratings_version_idx" ON "calibration_ratings" USING btree ("creator_id","voice_prompt","voice_model","rated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "calibration_ratings" AS PERMISSIVE FOR ALL TO public USING ("calibration_ratings"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid) WITH CHECK ("calibration_ratings"."creator_id" = nullif(current_setting('app.creator_id', true), '')::uuid);--> statement-breakpoint
-- Added by hand after `drizzle-kit generate` (ADR 0005, data-model.md § RLS).
ALTER TABLE "calibration_ratings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "calibration_ratings" TO nirvana_app;--> statement-breakpoint
REVOKE DELETE ON "calibration_ratings" FROM nirvana_app;--> statement-breakpoint
-- Every change is refused except the purge of `moment`; no DELETE either, whoever asks.
CREATE FUNCTION "calibration_ratings_purge_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.moment IS NULL
     AND NEW.moment_purged_at IS NOT NULL
     AND OLD.moment IS NOT NULL
     AND (to_jsonb(NEW) - 'moment' - 'moment_purged_at') = (to_jsonb(OLD) - 'moment' - 'moment_purged_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'calibration_ratings is append-only (only moment may be purged)' USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "calibration_ratings_append_only" BEFORE UPDATE OR DELETE ON "calibration_ratings"
  FOR EACH ROW EXECUTE FUNCTION "calibration_ratings_purge_only"();
