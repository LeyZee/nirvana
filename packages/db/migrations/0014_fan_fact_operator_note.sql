-- A chatter's note on giving a conversation back is kept as a fact of its own category (P3-02). The check is
-- widened only: every existing row stays valid, nothing is rewritten.
ALTER TABLE "fan_facts" DROP CONSTRAINT "fan_facts_category_check";--> statement-breakpoint
ALTER TABLE "fan_facts" ADD CONSTRAINT "fan_facts_category_check" CHECK ("fan_facts"."category" in ('identity', 'life', 'interests', 'preferences', 'commercial', 'intimate', 'events', 'operator_note'));