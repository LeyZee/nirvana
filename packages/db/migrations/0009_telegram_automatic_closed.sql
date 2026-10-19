-- The Telegram module reads `automatic_closed` (#91, ADR 0019): Automatique closed on its own tells the owner. Only
-- the trigger's list changes (it mirrors SCANNED_EVENT_TYPES in the telegram module, a test compares them); the
-- function is unchanged and the trigger never fails an outbox write.
DROP TRIGGER IF EXISTS "domain_events_telegram_scan" ON "domain_events";--> statement-breakpoint
CREATE TRIGGER "domain_events_telegram_scan" AFTER INSERT ON "domain_events"
  FOR EACH ROW
  WHEN (NEW.type IN ('handoff_requested', 'budget_threshold_crossed', 'session_state_changed', 'kill_switch_toggled', 'takeover_started', 'sale_detected', 'keyword_matched', 'validation_requested', 'validation_resolved', 'automatic_closed'))
  EXECUTE FUNCTION "telegram_enqueue_scan"();
