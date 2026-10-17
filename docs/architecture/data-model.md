# Modèle de données

Dernière revue : 2026-10-16. Le schéma Drizzle (`packages/db/src/schema/`, P0-03) fait foi pour les colonnes ; ce document explique les intentions. Toutes les tables métier portent `creator_id` (RLS) sauf `creators` et les tables système.

## Conventions

- Clés primaires `uuid` v7 générées par l'application (triables par temps).
- `created_at timestamptz` partout, `updated_at` sur les tables d'état, jamais sur les tables append-only.
- Identifiants externes sous la forme `platform_<x>_id text` + contrainte unique `(platform_account_id, platform_<x>_id)`.
- Argent : `amount_minor integer` + `currency char(3)`.
- Enum : `text` + `check` (plus simple à migrer qu'un type enum Postgres), valeurs définies dans `packages/contracts`.
- Nommage : colonnes SQL en `snake_case` ; clés des colonnes `jsonb`, des payloads d'événements et de jobs, et des DTO en `camelCase` (voir `docs/conventions/coding.md`).
- Suppression : logique (`deleted_at`) pour les tables d'état ; les tables append-only ne se suppriment pas (on anonymise via `erase-fan`).

## Tenant et comptes

```
creators            id, display_name, timezone, settings jsonb (schéma Zod CreatorSettings), created_at
platform_accounts   id, creator_id, platform (reveal|onlyfans|instagram|nirvana), handle,
                    session_state (none|valid|warning|expired), session_ciphertext bytea, session_updated_at,
                    last_poll_at, consecutive_errors, paused_until (coupe-circuit), connector_config jsonb (ConnectorConfigSchema)
audit_log           id, user_id, action, entity, entity_id, details jsonb, ip, created_at   (append-only)
```

### Utilisateurs du dashboard (Better Auth)

Les tables d'authentification sont **générées par la CLI de Better Auth** (adaptateur Drizzle) dans `packages/db/src/schema/auth.ts` : `user`, `session`, `account`, `verification`, avec deux champs additionnels sur `user` déclarés dans la config Better Auth : `role` (`owner|operator|creator`) et `creator_ids uuid[]`. Elles n'ont pas de `creator_id` et sont **hors RLS** (lues par Better Auth avec le rôle applicatif, qui suffit). Elles sont migrées comme les autres (`drizzle-kit generate`), jamais à la main. Défauts : email + mot de passe, cookies `SameSite=Lax`, sessions en base. P0-03 génère le schéma sans logique ; P0-07a branche Better Auth.

## Fans et mémoire (module `fans`)

```
fans            id, creator_id, platform_account_id, platform_fan_id, display_name, person_id (nullable, futur),
                first_seen_at, last_seen_at, kyc_state jsonb (slots remplis), tags text[], flags jsonb,
                platform_meta jsonb (données propres à la plateforme, ex. abonnement ; vide pour Reveal, voir own-platform.md)
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
messages             id, creator_id, platform_account_id (dénormalisé pour l'unicité), conversation_id, platform_message_id,
                     direction (inbound|outbound), author (fan|human|ai), text, media_ids uuid[], price_minor, currency, is_paid,
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

Payload minimal par famille d'événement (clés en camelCase, jamais de contenu média, jamais de secret) :

| Événements | Payload |
|---|---|
| `message_received`, `message_sent` | `messageId`, `platformMessageId`, `direction`, `author`, `mediaIds` |
| `send_attempted`, `send_failed`, `send_verified` | `draftId`, `idempotencyKey`, `attempt`, `error?` (code) |
| `media_described` | `mediaAssetId`, `mediaDescriptionId`, `model` |
| `draft_*` | `draftId`, `status`, `decidedBy?`, `editedBubbles?` (pour `draft_edited`) |
| `fact_*`, `summary_refreshed` | `fanId`, `factId?`, `summaryId?`, `category?` |
| `handoff_requested`, `takeover_started`, `takeover_ended`, `mode_changed` | `userId?`, `reason?`, `mode?` |
| `kill_switch_toggled` | `scope`, `scopeId`, `active`, `reason` |
| `follow_up_scheduled`, `follow_up_cancelled` | `jobKey`, `runAt?` |
| `offer_made`, `sale_detected` | `offerId?`, `saleId?`, `amountMinor`, `currency` |
| `script_*` | `scriptRunId`, `stepIndex?` |
| `session_state_changed` | `platformAccountId`, `from`, `to` |
| `error` | `code`, `jobName?`, `retryable` |

Les schémas Zod exacts vivent dans `packages/contracts/src/events.ts` (P0-02) ; ce tableau fixe l'intention.

Règle : **toute** modification de `conversations`, `drafts`, `messages` passe par une fonction qui écrit l'événement correspondant dans la même transaction. Il n'existe pas d'`UPDATE` « nu ».

### Événements hors conversation

```
domain_events   id, creator_id (nullable), type, payload jsonb, actor, correlation_id, created_at   (append-only)
```

Même rôle d'outbox que `conversation_events` pour ce qui ne concerne pas une conversation (activation d'une persona, changement de session plateforme, kill switch global). Même liste fermée de types.

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
            input_tokens, output_tokens, cost_minor, currency, cost_micro_usd (coût exact), latency_ms,
            status (les 12 issues de la passerelle : ok, refused, timeout, rate_limited…), is_fallback,
            conversation_id (nullable), draft_id (nullable, sans clé étrangère : l'appel précède le brouillon),
            trace_id (Langfuse), created_at. Journal de la passerelle (LlmCallStore), lu au démarrage pour le
            plafond quotidien.
```

## Supervision (module `supervision`)

```
notifications   id, creator_id, user_id, type, payload jsonb, read_at, created_at
kill_switches   id, scope (global|creator|conversation), scope_id (nullable pour global), creator_id (nullable pour global),
                active, reason, set_by, set_at
```

Les approbations et prises en main ne sont pas une table : ce sont des `conversation_events` (`draft_approved`, `takeover_started`, …) et l'état des `drafts`.

## Système (hors RLS, sans `creator_id`)

```
worker_heartbeats   worker_id text PK, hostname, version, last_seen_at      (écrit toutes les 30 s par chaque worker, lu par /ready)
```

## Commercial (phase 6, réservé)

```
offers, sales, scripts, script_steps, script_runs, cards   — voir docs/roadmap.md phase 6
```

## Jobs (Graphile Worker, tables gérées par la lib dans le schéma `graphile_worker`)

Noms et payloads dans `packages/contracts/src/jobs.ts`. Conventions : `queue_name = conv:<conversation_id>` pour tout job qui touche une conversation ; `job_key = <job>:<conversation_id>` avec `replace` pour les jobs qu'on debounce (`respond`, `follow_up`, `refresh_summary`).

Une commande enfile dans sa propre transaction (outbox, ADR 0006) par `public.enqueue_job(task, payload, queue_name, run_at, max_attempts, job_key)` (migration `0001`) : fonction `SECURITY DEFINER` du propriétaire, seul droit de `nirvana_app` sur Graphile ; si la transaction est annulée, le job l'est aussi.

## RLS

- Les tables appartiennent à `nirvana_admin` (rôle des migrations, `NOSUPERUSER BYPASSRLS` en production : `FORCE` s'applique au propriétaire, `BYPASSRLS` lui laisse traverser les tenants pour `withAdmin`). L'application se connecte en `nirvana_app` (`NOSUPERUSER NOBYPASSRLS`, droits par `GRANT` seulement, voir `packages/db/docker/init.sql`). Si `nirvana_app` possédait les tables, la RLS ne s'appliquerait pas à lui.
- Chaque table avec `creator_id` a `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` et la politique :

  ```sql
  USING (creator_id = NULLIF(current_setting('app.creator_id', true), '')::uuid)
  WITH CHECK (creator_id = NULLIF(current_setting('app.creator_id', true), '')::uuid)
  ```

  Le second argument `true` (`missing_ok`) fait que, hors `withTenant`, la politique compare à `NULL` et retourne **zéro ligne** au lieu de lever « unrecognized configuration parameter ». C'est ce que le test de P0-03 vérifie.
- `withTenant(creatorId, tx => …)` ouvre une transaction et fait `SET LOCAL app.creator_id = …`. Les jobs système multi-tenant (réconciliation, purge, dispatch des polls) passent par `withAdmin` (`DATABASE_ADMIN_URL`) dans des fonctions nommées `*Unscoped`.
- **Hors RLS** (pas de `creator_id`) : `creators`, les tables Better Auth, `audit_log`, `worker_heartbeats`, les lignes `kill_switches` de scope `global` (politique : `creator_id IS NULL OR creator_id = …`), les tables `graphile_worker`.

## Index de départ

- `messages (conversation_id, platform_created_at desc)` ; `UNIQUE (platform_account_id, platform_message_id)`
- `conversation_events (conversation_id, seq)`, `(type, created_at)` pour les vues
- `fan_facts (fan_id) where superseded_by is null` (l'expiration se filtre à la requête : `now()` est interdit dans un prédicat d'index)
- `conversations (platform_account_id, state)`, `(creator_id, last_inbound_at desc)`
- `llm_calls (creator_id, created_at)`
