# Modèle de données

Dernière revue : 2026-10-16. Le schéma Drizzle (`packages/db/src/schema/`) fait foi pour les colonnes ; ce document explique les intentions. Toutes les tables métier portent `creator_id` (RLS) sauf `creators` et les tables système.

## Conventions

- Clés primaires `uuid` v7 générées par l'application (triables par temps).
- `created_at timestamptz` partout, `updated_at` sur les tables d'état, jamais sur les tables append-only.
- Identifiants externes sous la forme `platform_<x>_id text` + contrainte unique `(platform_account_id, platform_<x>_id)`.
- Argent : `amount_minor integer` + `currency char(3)`.
- Enum : `text` + `check` (plus simple à migrer qu'un type enum Postgres), valeurs définies dans `packages/contracts`.
- Suppression : logique (`deleted_at`) pour les tables d'état ; les tables append-only ne se suppriment pas (on anonymise via `erase-fan`).

## Tenant et comptes

```
creators            id, display_name, timezone, settings jsonb (schéma Zod CreatorSettings), created_at
platform_accounts   id, creator_id, platform (reveal|onlyfans|instagram|nirvana), handle,
                    session_state (none|valid|warning|expired), session_ciphertext bytea, session_updated_at,
                    last_poll_at, connector_config jsonb
users               id, email, role (owner|operator|creator), creator_ids[], (géré par Better Auth)
audit_log           id, user_id, action, entity, entity_id, details jsonb, ip, created_at   (append-only)
```

## Fans et mémoire (module `fans`)

```
fans            id, creator_id, platform_account_id, platform_fan_id, display_name, person_id (nullable, futur),
                first_seen_at, last_seen_at, kyc_state jsonb (slots remplis), tags text[], flags jsonb
fan_facts       id, creator_id, fan_id, category (identity|life|interests|preferences|commercial|intimate|events),
                key, value, kind (declared|inferred), confidence (0..1), source_message_id,
                observed_at, expires_at, superseded_by (nullable), created_at   (append-only : on remplace, on ne modifie pas)
fan_summaries   id, creator_id, fan_id, version, content text, based_on_message_id, created_at
```

Un fait n'est jamais mis à jour en place : un nouveau fait remplace l'ancien (`superseded_by`), ce qui garde l'historique (« il a dit Lyon en mai, Paris en août »). Le contexte LLM reçoit les faits actifs (non remplacés, non expirés) triés par catégorie et confiance.

## Conversations (module `conversations`)

```
conversations        id, creator_id, platform_account_id, fan_id, platform_conversation_id,
                     state (idle|pending|drafting|awaiting_approval|sending|human|paused|error),
                     mode (copilot|auto), last_inbound_at, last_outbound_at, unread_count,
                     cooldowns jsonb, active_script_run_id (nullable), updated_at
messages             id, creator_id, conversation_id, platform_message_id, direction (inbound|outbound),
                     author (fan|human|ai), text, media_ids uuid[], price_minor, currency, is_paid,
                     platform_created_at, created_at, draft_id (nullable)
                     UNIQUE (platform_account_id, platform_message_id)
conversation_events  id, creator_id, conversation_id, seq bigint, type, payload jsonb, actor (system|ai|human:<user_id>|fan),
                     correlation_id, created_at      (append-only, UNIQUE (conversation_id, seq))
drafts               id, creator_id, conversation_id, status (pending|approved|edited|rejected|sent|failed|expired),
                     brief jsonb (sortie du cerveau), bubbles text[], final_bubbles text[] (après édition),
                     persona_version_id, prompt_hashes jsonb, policy_trace jsonb, guard_trace jsonb,
                     decided_by (nullable user_id), decided_at, idempotency_key, created_at
```

Types d'événements (liste fermée dans `packages/contracts/src/events.ts`) : `message_received`, `message_sent`, `send_attempted`, `send_failed`, `send_verified`, `media_described`, `draft_created`, `draft_approved`, `draft_edited`, `draft_rejected`, `draft_expired`, `fact_proposed`, `fact_confirmed`, `fact_rejected`, `summary_refreshed`, `handoff_requested`, `takeover_started`, `takeover_ended`, `mode_changed`, `kill_switch_toggled`, `follow_up_scheduled`, `follow_up_cancelled`, `offer_made`, `sale_detected`, `script_started`, `script_step_sent`, `script_ended`, `session_state_changed`, `error`.

Règle : **toute** modification de `conversations`, `drafts`, `messages` passe par une fonction qui écrit l'événement correspondant dans la même transaction. Il n'existe pas d'`UPDATE` « nu ».

## Persona (module `persona`)

```
persona_versions  id, creator_id, version (semver), source_path, content jsonb (validé par PersonaSchema),
                  content_hash, is_active, activated_at, created_by, created_at
```

## Médias (module `media`)

```
media_assets        id, creator_id, kind (image|video|audio), origin (creator|fan), fan_id (nullable),
                    storage_key, mime, bytes, duration_ms, sha256, rights jsonb, expires_at, created_at
media_descriptions  id, creator_id, media_asset_id, vocabulary_version, content jsonb (MediaDescription),
                    model, prompt_hash, created_at
media_sends         id, creator_id, media_asset_id, fan_id, conversation_id, message_id, price_minor, currency, sent_at
                    (anti-doublon : un média payant n'est jamais revendu au même fan)
```

## LLM (packages/llm)

```
llm_calls   id, creator_id (nullable), role (sense|brain|voice|judge), provider, model, prompt_hash,
            input_tokens, output_tokens, cost_minor, currency, latency_ms, status (ok|error|refused|timeout),
            conversation_id (nullable), draft_id (nullable), trace_id (Langfuse), created_at
```

## Supervision (module `supervision`)

```
notifications   id, creator_id, user_id, type, payload jsonb, read_at, created_at
kill_switches   scope (global|creator|conversation), scope_id, active, reason, set_by, set_at
```

## Commercial (phase 6, réservé)

```
offers, sales, scripts, script_steps, script_runs, cards   — voir docs/roadmap.md phase 6
```

## Jobs (Graphile Worker, tables gérées par la lib dans le schéma `graphile_worker`)

Noms et payloads dans `packages/contracts/src/jobs.ts`. Conventions : `queue_name = conv:<conversation_id>` pour tout job qui touche une conversation ; `job_key = <job>:<conversation_id>` avec `replace` pour les jobs qu'on debounce (`respond`, `follow_up`, `refresh_summary`).

## RLS

Chaque table avec `creator_id` a : `ENABLE ROW LEVEL SECURITY` + politique `USING (creator_id = current_setting('app.creator_id')::uuid)`. L'application se connecte avec un rôle non-superuser et ouvre chaque unité de travail par `withTenant(creatorId, tx => …)` qui fait `SET LOCAL app.creator_id`. Les jobs système multi-tenant (réconciliation, purge) utilisent un rôle `nirvana_admin` explicitement, dans des fonctions nommées `*Unscoped`.

## Index de départ

- `messages (conversation_id, platform_created_at desc)`
- `conversation_events (conversation_id, seq)`, `(type, created_at)` pour les vues
- `fan_facts (fan_id) where superseded_by is null and (expires_at is null or expires_at > now())`
- `conversations (platform_account_id, state)`, `(creator_id, last_inbound_at desc)`
- `llm_calls (creator_id, created_at)`
