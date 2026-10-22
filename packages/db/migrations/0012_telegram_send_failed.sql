-- The Telegram module reads `send_failed` (recette R-G5): a message of the agent that will never leave tells the
-- groups. Only the trigger's list changes (it mirrors SCANNED_EVENT_TYPES in the telegram module, a test compares
-- them); the function is unchanged. The module itself keeps only the final failure (`isFinal`).
DROP TRIGGER IF EXISTS "domain_events_telegram_scan" ON "domain_events";--> statement-breakpoint
CREATE TRIGGER "domain_events_telegram_scan" AFTER INSERT ON "domain_events"
  FOR EACH ROW
  WHEN (NEW.type IN ('handoff_requested', 'budget_threshold_crossed', 'session_state_changed', 'kill_switch_toggled', 'takeover_started', 'takeover_ended', 'sale_detected', 'keyword_matched', 'validation_requested', 'validation_resolved', 'automatic_closed', 'send_failed'))
  EXECUTE FUNCTION "telegram_enqueue_scan"();
