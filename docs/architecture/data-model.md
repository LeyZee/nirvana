# Modèle de données

Dernière revue : 2026-10-16. Le schéma Drizzle (`packages/db/src/schema/`, P0-03) fait foi pour les colonnes ; ce document explique les intentions. Toutes les tables métier portent `creator_id` (RLS) sauf `creators` et les tables système.

## Conventions

- Clés primaires `uuid` v7 générées par l'application (triables par temps).
- `created_at timestamptz` partout, `updated_at` sur les tables d'état, jamais sur les tables append-only.
- Identifiants externes sous la forme `platform_<x>_id text` + contrainte unique `(platform_account_id, platform_<x>_id)`.
- Argent : `amount_minor integer` + `currency char(3)`.
- Enum : `text` + `check` (plus simple à migrer qu'un type enum Postgres), valeurs définies dans `packages/contracts`.
- Nommage : colonnes SQL en `snake_case` ; clés des colonnes `jsonb`, des payloads d'événements et de jobs, et des DTO en `camelCase` (voir `docs/conventions/coding.md`). Ce qui reste en `jsonb` et ce qui devient colonne : `docs/architecture/jsonb.md`.
- Suppression : logique (`deleted_at`) pour les tables d'état ; les tables append-only ne se suppriment pas (on anonymise via `erase-fan`).

## Tenant et comptes

```
creators            id, display_name, timezone, settings jsonb (schéma Zod CreatorSettings),
                    agent_hours jsonb (AgentHoursSchema, null = DEFAULT_AGENT_HOURS, P3-14), created_at
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
fan_facts       id, creator_id, fan_id, category (identity|life|interests|preferences|commercial|intimate|events|operator_note),
                key, value, kind (declared|inferred), confidence (0..1), source_message_id,
                observed_at, expires_at, superseded_by (nullable), created_at   (append-only : on remplace, on ne modifie pas)
fan_summaries   id, creator_id, fan_id, version, content text, based_on_message_id, created_at
```

`fans.flags` suit `FanFlagsSchema` (contracts, clés fermées ; chaque changement est un événement `fan_flag_set` ou `fan_flag_cleared` qui porte tout le jeu de drapeaux après le changement, son auteur étant l'acteur de l'événement, un humain ou la politique) : `ageConfirmedAt`, `salesFrozen` (`reason` : `money_trouble`, `spending_limit`, `distress`, `operator` ; `since`), `spendingLimitMinor`, `fragile`, `noExplicit`, `doNotContact`. Les slots KYC sont les clés `KycSlotSchema` (lignes du canevas de notes de Reveal) ; un slot est rempli par un fait actif de même clé.

Un fait n'est jamais mis à jour en place : un nouveau fait remplace l'ancien (`superseded_by`), ce qui garde l'historique (« il a dit Lyon en mai, Paris en août »). Le contexte LLM reçoit les faits actifs (non remplacés, non expirés) triés par catégorie et confiance.

D'où viennent les faits (P3-02) : les `factsProposed` du brief restent sur le brouillon (`drafts.brief`), datés par le message du fan où ils ont été lus ; une catégorie inconnue est ignorée, et `operator_note` n'est jamais acceptée d'un modèle. Quand un humain approuve le brouillon, le job `conversation.record_facts` les fait écrire par le module `fans`, puis écrit un `fact_confirmed` par fait nouveau dans le journal de la conversation ; un brouillon refusé ou expiré n'écrit rien. La note qu'un chatteur laisse en rendant la main (`release`, `note`) devient un fait `operator_note`, une clé par note (sa date) : les notes s'ajoutent sans se remplacer. Rejoué, le job ne réécrit rien.

## Conversations (module `conversations`)

```
conversations        id, creator_id, platform_account_id, fan_id, platform_conversation_id,
                     state (idle|pending|drafting|awaiting_approval|sending|human|paused|error),
                     mode (copilot|auto), last_inbound_at, last_outbound_at, unread_count,
                     cooldowns jsonb, active_script_run_id (nullable), routed_to_user_id (nullable, fk user), desire_score, desire_band, desire_at (nullables ensemble, P3-12), updated_at
messages             id, creator_id, platform_account_id (dénormalisé pour l'unicité), conversation_id, platform_message_id,
                     direction (inbound|outbound), author (fan|human|ai), text, media_ids uuid[], price_minor, currency, is_paid,
                     platform_created_at, created_at, draft_id (nullable),
                     platform_media jsonb (médias listés par la plateforme : kind, ref, isLocked ; lus par le moteur
                     avant que le module media ne les range dans media_ids)
                     UNIQUE (platform_account_id, platform_message_id)
conversation_events  id, creator_id, conversation_id, seq bigint, type, payload jsonb, actor (system|ai|human:<user_id>|fan),
                     correlation_id, created_at      (append-only, UNIQUE (conversation_id, seq))
drafts               id, creator_id, conversation_id, status (pending|approved|edited|rejected|sent|failed|expired),
                     brief jsonb (sortie du cerveau), bubbles text[], final_bubbles text[] (après édition),
                     persona_version_id (la persona active quand il est écrit, ADR 0022), prompt_hashes jsonb, policy_trace jsonb, guard_trace jsonb,
                     decided_by (nullable user_id), decided_at, idempotency_key, created_at
blind_tests          id, creator_id, voice_prompt, voice_model, persona_version_id (nullable), rate_per_mille (0 à 1000, 800 = 80 %), recorded_by,
                     recorded_at      (append-only : ni UPDATE ni DELETE pour nirvana_app)
                     Le test à l'aveugle d'une version de la voix et de la persona active (ADR 0019, 0022) ; le dernier
                     de la version décide.
```

`conversations.last_inbound_at` est l'heure où Nirvana a lu le dernier message du fan (ordre d'arrivée : debounce, brouillon périmé, relances). Ce que l'écran montre (« A écrit il y a… », `ConversationSummary.lastInboundAt`) est l'heure du message sur la plateforme, `max(messages.platform_created_at)` des messages entrants : une capture qui relit l'historique ne fait pas dire « à l'instant » d'un message de cinq heures.

Types d'événements (liste fermée dans `packages/contracts/src/events.ts`) : `message_received`, `message_sent`, `send_attempted`, `send_failed`, `send_verified`, `media_described`, `draft_created`, `draft_approved`, `draft_edited`, `draft_rejected`, `draft_expired`, `fact_proposed`, `fact_confirmed`, `fact_rejected`, `summary_refreshed`, `handoff_requested`, `alert_triggered`, `takeover_started`, `takeover_ended`, `mode_changed`, `kill_switch_toggled`, `follow_up_scheduled`, `follow_up_cancelled`, `offer_made`, `sale_detected`, `script_started`, `script_step_sent`, `script_ended`, `session_state_changed`, `budget_threshold_crossed`, `automatic_closed`, `error`.

Payload minimal par famille d'événement (clés en camelCase, jamais de contenu média, jamais de secret) :

| Événements | Payload |
|---|---|
| `message_received`, `message_sent` | `messageId`, `platformMessageId`, `direction`, `author`, `mediaIds` |
| `send_attempted`, `send_failed`, `send_verified` | `conversationId`, `draftId`, `idempotencyKey`, `attempt`, `error?` (code), `isFinal?` (`send_failed` : aucun essai ne suit ; seul celui-là va dans l'outbox) |
| `media_described` | `mediaAssetId`, `mediaDescriptionId`, `model` |
| `draft_*` | `draftId`, `status`, `decidedBy?`, `editedBubbles?` (pour `draft_edited`) |
| `fact_*`, `summary_refreshed` | `fanId`, `factId?`, `summaryId?`, `category?` |
| `handoff_requested` | `conversationId`, `cause` (liste fermée : `minor`, `non_consent`, `distress`, `meeting`, `manipulation`, `guard`, `budget`, `keyword`, `llm_unavailable`, `other`, `custom_alert`, `identity_doubt` ; les alertes classent sur elle, jamais sur `reason`), `reason?` (une phrase en français pour un chatteur, jamais un code), `detail?` (les codes du moteur, `guard_blocked`, `meeting_promise`…, gardés au journal et jamais affichés ; une ligne ancienne qui les joignait dans `reason` est relue ainsi), `trigger?` (l'alerte qui a mis l'agent en pause, P4-01, comme ci-dessous) |
| `alert_triggered` | `conversationId`, `trigger` : `alert` (`{ kind: 'custom', id }` ou `{ kind: 'system', code }`, codes `keyword`, `service_request`, `identity_doubt`), `matchedBy` (`keyword` \| `rule` \| `model`), `keyword?` (le mot tel qu'elle l'a déclaré, présent pour un mot-clé et lui seul). Une alerte qui prévient seulement ; celle qui met en pause est un `handoff_requested` avec son `trigger`, jamais les deux. Rien de ce que le fan a écrit (ADR 0020). |
| `takeover_started`, `takeover_ended` | `conversationId`, `userId?`, `reason?` |
| `mode_changed` | `userId?`, `reason?`, `mode?` |
| `kill_switch_toggled` | `scope`, `scopeId`, `active`, `reason` |
| `follow_up_scheduled`, `follow_up_cancelled` | `jobKey`, `runAt?` |
| `offer_made`, `sale_detected` | `offerId?`, `saleId?`, `amountMinor`, `currency` |
| `script_*` | `scriptRunId`, `stepIndex?` |
| `session_state_changed` | `platformAccountId`, `from`, `to` |
| `budget_threshold_crossed` (outbox seulement, sans créatrice) | `kind` (`alert` \| `reached`), `spentMinor`, `capMinor`, `currency`, `day` |
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

## Calibrage (module `agent`, playground)

```
calibration_ratings   id, creator_id, session_id, rated_at, voice_prompt, voice_model,
                      verdict_kind (validated|corrected|rejected), verdict jsonb (Verdict), destination
                      (voice_example|rule|test, nullable), fan_message, bubbles jsonb, moment jsonb (RatedMoment,
                      opaque, nullable une fois purgé), moment_purged_at, created_at
  Append-only (trigger) : seule la purge de `moment` après 90 jours est permise, le verdict et la version restent.
  Lu pour le taux de validation (50 derniers par version), les exemples de voix (corrected + voice_example, 12 max)
  et les tests rejouables (tout sauf validated). Contenu intime : jamais copié dans les logs.
```

## Supervision (module `supervision`)

```
notifications   id, creator_id, user_id, type, payload jsonb, read_at, created_at
kill_switches   id, scope (global|creator|conversation), scope_id (nullable pour global), creator_id (nullable pour global),
                active, reason, set_by, set_at
```

Alertes (module `alerts`, P4-01, migration 0025) :

```
custom_alerts   id, group_id, creator_id, name, phrase (≤ 500, nullable), keywords text[] (≤ 40), pauses_agent, notify,
                enabled, created_by, updated_by, created_at, updated_at, archived_at
system_alert_settings  creator_id, code (keyword|service_request|identity_doubt), enabled, updated_by, updated_at
alert_seen      creator_id, event_id → conversation_events, seen_by, seen_at   (clé : creator_id, event_id)
```

Une alerte personnalisée a une ligne par créatrice (RLS), et les lignes écrites ensemble partagent `group_id` : l'écran les montre comme une seule alerte. Il faut une phrase ou au moins un mot-clé (contrôle en base comme dans le contrat). Une alerte retirée est archivée (`archived_at`), jamais supprimée, pour que l'historique garde son nom (`nirvana_app` n'a pas `DELETE`). Une alerte système sans ligne dans `system_alert_settings` est active, et `keyword` ne peut pas être désactivée (contrôle en base). `alert_seen` porte le « vu » de l'historique, puisque le journal est en ajout seul : une marque par événement, partagée par l'agence, en ajout seul aussi.

Les approbations et prises en main ne sont pas une table : ce sont des `conversation_events` (`draft_approved`, `takeover_started`, …) et l'état des `drafts`.

## Équipe (module `team`, ADR 0023, EQ-01)

```
team_members             id, user_id (unique → user), team_role (chatter|manager), first_name, last_name, display_name,
                         country (ISO 3166-1 alpha-2), time_zone, status (active|on_leave|sick|travelling|suspended|left),
                         color (#rrggbb), joined_on, created_at, updated_at        (jamais supprimé : un membre parti est `left`)
team_member_notes        id, member_id, body (1 à 2 000 car.), author_user_id, created_at          (ajout seul)
commission_presets       id, name, rate_bps (0 à 10 000), effective_from, created_by, created_at   (ajout seul, unique name + effective_from)
member_commission_rates  id, member_id, rate_bps, team_share_bps (manager), preset_id, effective_from, created_by, created_at
                         (ajout seul, unique member_id + effective_from : le taux d'un jour est la dernière ligne en vigueur ce jour-là)
invitation_links         id, member_id, purpose (invitation|reset), token_hash (SHA-256, unique), created_by, expires_at,
                         used_at, revoked_at, created_at      (EQ-10 ; hors RLS et hors de portée de nirvana_app : withAdmin seul)
```

L'e-mail et la photo restent sur `user` (Better Auth), jamais recopiés. Les notes internes sont dans leur propre table : sur la ligne du membre, la RLS (par ligne) les lui montrerait.

Un lien d’invitation (EQ-10) ne garde que l’empreinte de son jeton. Il sert une fois, par un seul `UPDATE` qui pose `used_at` tant que le lien n'est ni utilisé, ni annulé, ni expiré, et que le membre n'est pas parti. Un membre a au plus un lien vivant (index unique partiel) : un nouveau lien annule le précédent (`revoked_at`). Comme `provider_credentials`, la table est retirée à `nirvana_app` (`REVOKE ALL`, migration 0018).

## Planning (module `scheduling`, ADR 0023, ADR 0025, EQ-02)

```
scheduling_settings      id (= 1, une ligne au plus), time_zone (fuseau de la grille), slot_start_minute, slot_length_minutes
                         (60 à 720, divise la journée), access_margin_minutes (0 à 120), updated_by, updated_at
                         (sans ligne : les valeurs par défaut du module)
shift_templates          id, creator_id, platform_account_id, member_id, weekday (1 lundi … 7 dimanche), start_minute,
                         end_minute (minutes murales du fuseau de la grille ; une fin avant le début est le lendemain ;
                         23 h au plus), valid_from, valid_until, created_by, created_at
                         (seule valid_until change, une fois : on termine un modèle)
shifts                   id, creator_id, platform_account_id, member_id, starts_at, ends_at ([début, fin) en UTC, minutes
                         entières, 24 h au plus), template_id, template_starts_at (le début que le modèle lui a donné,
                         gardé si on le déplace), cancelled_at, stopped_at (arrêté en cours : ends_at est la minute de
                         l'arrêt), created_by, updated_by, created_at, updated_at
                         (jamais supprimé : annulé ; unique template_id + template_starts_at, annulés et déplacés compris)
leave_requests           id, member_id (sans créatrice, ADR 0031), first_day, last_day (jours du fuseau du membre, 31 au
                         plus), time_zone, starts_at, ends_at (fixés à la demande), note, status (pending|approved|
                         refused|withdrawn|cancelled), decided_at, decided_by, decision_note, cancelled_at, cancelled_by,
                         created_by, created_at, updated_at (jamais supprimé ; annulé, il couvre [starts_at, cancelled_at))
shift_swap_requests      id, creator_id, shift_id, requester_id, shift_starts_at, shift_ends_at (le shift proposé et ses
                         heures notées à la proposition), target_member_id, target_creator_id, target_shift_id,
                         target_shift_starts_at, target_shift_ends_at (le shift pris en échange, ou rien pour un don),
                         message, status (proposed|accepted|declined|withdrawn|lapsed|reverted), resolved_at,
                         resolved_by, reverted_at, reverted_by, created_by, created_at, updated_at
                         (jamais supprimé ; une seule proposition ouverte par shift, collègue et shift demandé)
shift_reports            id, creator_id, platform_account_id, shift_id, member_id (ceux du shift, clé composite),
                         period (quinzaine du début du shift, fuseau de l'agence, figée à l'écriture), corrects_id (le
                         rapport que corrige une correction, du même shift), amount_minor (borné ; rapport ≥ 0,
                         correction ≠ 0), currency, comment, incident (rapport seul), status (submitted|validated|
                         rejected), version, by_agency (correction faite par l'agence), submitted_by, submitted_at,
                         reviewed_by, reviewed_at, review_note, created_by, created_at, updated_at
                         (EQ-03, migration 0026 ; un rapport par shift ; jamais supprimé ; validé, il ne change plus)
account_pay_rules        id, creator_id, platform_account_id, from_period (1er ou 16), currency, vat_bps,
                         platform_fee_bps (points de base entiers), earnings_source (declared|detected), created_by,
                         created_at (EQ-03, migration 0026 ; ajout seul, une par compte et par quinzaine)
```

Deux contraintes d'exclusion (`btree_gist`, `tstzrange(starts_at, ends_at, '[)')`, migration 0021) tiennent un membre hors de deux shifts à la fois et un compte hors de deux membres à la fois, shifts annulés exceptés : deux personnes qui planifient au même instant ne peuvent pas gagner toutes les deux. Celle du membre est `DEFERRABLE INITIALLY IMMEDIATE` depuis la migration 0023 : vérifiée à chaque instruction, sauf dans l'échange de deux shifts aux mêmes heures, qui la reporte à la fin de ses deux écritures. Une contrainte reportable n'arbitre pas un `ON CONFLICT` : le job des modèles saute une occurrence occupée dans son propre point de sauvegarde. Une clé étrangère composite `(platform_account_id, creator_id)` vers `platform_accounts (id, creator_id)` garde chaque shift et chaque modèle sur le compte de sa créatrice. Le passé du planning est gardé, pour tous les rôles, celui du job compris (déclencheurs `refuse_planning_change`) : rien n'est supprimé, un shift ne change ni de créatrice, ni de compte, ni de modèle, un shift en cours garde son début et son membre et ne fait que finir plus tôt (la fenêtre d'accès du chatteur, ADR 0025, se lit sur ces colonnes), un shift fini ou annulé ne change plus, un modèle ne change que sa fin, une fois. Les droits par colonne tiennent en plus le rôle de l'application, qui part de `REVOKE ALL` : ni `DELETE`, ni `TRUNCATE`.

Congés et échanges (migration 0023, ADR 0031) suivent la même garde : rien n'est supprimé, et un déclencheur ne laisse avancer leur statut que dans un sens (un congé en attente est validé, refusé ou retiré ; un congé validé s'annule avant sa fin, en gardant l'instant et l'auteur de sa validation ; une proposition d'échange est acceptée, refusée, retirée ou tombée ; un échange accepté s'annule en gardant l'instant et l'auteur de l'acceptation). Deux congés en attente ou validés d'un même membre ne se chevauchent jamais (exclusion `leave_requests_member_overlap_excl`). Une proposition pointe ses shifts par une clé étrangère composite `(shift_id, creator_id)` vers `shifts (id, creator_id)`, pour qu'un shift ne soit jamais rangé sous une autre créatrice que la sienne.

Rapports de fin de shift et règles de paie d'un compte (migration 0026, EQ-03) gardent le passé de la paie (déclencheurs `refuse_pay_change`, pour tous les rôles) : rien n'est supprimé, les règles s'ajoutent sans jamais changer, et un rapport garde son shift, sa quinzaine, sa devise, son auteur et ce qu'il corrige. Chaque changement prend la `version` suivante, pour qu'une relecture nomme ce qu'elle a lu. Un rapport ne passe que de `submitted` à `submitted` (changé), `validated` ou `rejected`, et de `rejected` à `submitted` : validé, il ne change plus, et une relecture ne touche jamais au montant. Une clé composite `(shift_id, creator_id, platform_account_id, member_id)` vers `shifts` le pose sur la créatrice, le compte et le membre de son shift, qui ne changent plus une fois le shift commencé ; une autre, `(corrects_id, shift_id)`, garde une correction sur un rapport du même shift. Un shift qui a son rapport ne s'annule plus (`refuse_reported_shift_cancel`).

## Système (hors RLS, sans `creator_id`)

```
worker_heartbeats   worker_id text PK, hostname, version, last_seen_at      (écrit toutes les 30 s par chaque worker, lu par /ready)
rate_limit_counters key text PK (haché, ≤ 512), hits int > 0, window_ends_at   (limiteur partagé de l’API, ADR 0027 ; UNLOGGED, purgé 1 h après la fin de la fenêtre)
backup_runs         id uuid PK (défaut en base), started_at, finished_at?, status (running|succeeded|failed), error? ≤ 500, object_key?, size_bytes?, sha256? unique, pg_dump_version?, row_counts? jsonb objet   (export quotidien, ADR 0028 ; écrit par le service backup seul, lu par l’app)
restore_tests       id PK, backup_run_id FK, tested_at, duration_seconds > 0, row_count_mismatches ≥ 0, notes? ≤ 500, entered_by_user_id FK, created_at   (essai de restauration saisi par le propriétaire, ajout seul, ADR 0028 § 6)
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
- **Note de désir** (`conversations.desire_score`, `desire_band`, `desire_at`, migration 0022) : projection du dernier `desire_scored`, la note de 0 à 100 que le moteur calcule (P3-12), sa bande (`desireBandOf`, jamais stockée à part de sa note) et l'heure du calcul, à partir de laquelle la note retombe. Le moteur ne rend une note que si elle a bougé par rapport à la note stockée retombée jusqu'à maintenant ; le worker écrit alors `desire_scored` avec le résultat qu'elle accompagne. Une reconstruction retrouve exactement la note que la politique a lue. Le Suivi ne lit jamais `desire_band` : la liste rend la note retombée jusqu'à l'heure de la réponse et la bande de cette note (`ConversationSummary.desire`), et la courbe du lecteur relit les `desire_scored` du journal (`GET /v1/conversations/{id}/desire`).
- **Conversation routée** (`conversations.routed_to_user_id`, migration 0016) : un membre de l'équipe au scope `self` (chatteur, manager qui n'est pas actif) n'a aucun accès à toute une créatrice. `requireRole` déplace ses `creator_ids` dans `routedCreatorIds` (contrat `CurrentUser`), donc toute route qui vérifie `creatorIds` le refuse, et `conversations` ne lui ouvre que les conversations qui lui sont routées : lire, valider, refuser, prendre et rendre la main ; jamais le mode, le Dashboard, les fans ni la persona. Garde du serveur, pas de RLS : EQ-13 (ADR 0025) ouvrira les conversations et les fans des créatrices de son shift actif par une liste à part (`shiftCreatorIds`), lue seulement par ces routes ; `creatorIds` reste vide, donc la persona et le Dashboard restent fermés.
- **Tables de l'équipe** (sans `creator_id`) : une politique par compte. `withMember(db, userId, (tx, scope) => …)` fait `SET LOCAL app.user_id`, lit dans la même transaction le rôle d'accès (`user.role`) et la ligne `team_members` du compte, puis fait `SET LOCAL app.team_scope` (scopes fixés par l'ADR 0024) : `owner` pour le propriétaire, `agency` pour un manager au statut `active`, `self` pour tous les autres (`teamScopeFor`, contracts). Le scope n'est jamais lu dans la requête. `self` lit ses propres lignes (sa fiche, ses taux) ; `agency` lit toute l'équipe sauf les notes posées sur sa propre fiche, et écrit des notes signées de son compte ; seul `owner` crée ou modifie une fiche et insère un taux ou un préréglage, signé de son compte (`created_by`). Hors `withMember`, aucune ligne. Notes, préréglages et taux sont en ajout seul (`REVOKE UPDATE, DELETE` et trigger `refuse_change`) ; `team_members` n'a pas de `DELETE` (migration 0015).
- **Tables du planning** (`creator_id` **et** `member_id`, ADR 0023 § Données et RLS) : `withTenantMember(db, creatorId, userId, (tx, scope) => …)` pose les trois réglages (`app.creator_id`, `app.user_id`, `app.team_scope`). Un shift ou un modèle se lit dans sa créatrice, par le membre lui-même ou par le scope `owner` | `agency` : deux chatteurs d'une même créatrice ne lisent pas les shifts l'un de l'autre. Seuls `owner` et `agency` écrivent, signé de leur compte. Un lecteur de plusieurs créatrices boucle, une transaction par créatrice. `scheduling_settings` (sans créatrice) se lit par tout scope posé et s'écrit par le propriétaire.
- **Congés et échanges** (ADR 0031, migration 0023) : `leave_requests` n'a pas de créatrice et suit les tables de l'équipe (`withMember`) : le membre lit, demande et retire les siens ; `owner` et `agency` lisent tout et décident, signé de leur compte, mais un manager ne décide jamais de son propre congé. `shift_swap_requests` porte les deux créatrices et se lit dans l'une d'elles, par l'un des deux membres ou par `owner` | `agency` ; le membre qui propose l'écrit sur son propre shift, le collègue répond, `owner` et `agency` annulent. L'acceptation reste sous RLS : deux politiques de `shifts` (`swap_read`, `swap_update`) laissent le collègue lire le shift qu'on lui propose et déplacer un shift quand un échange `accepted` **dans la transaction en cours** (`resolved_at = now()`), dont il est le collègue, nomme ce shift, vers l'autre membre de l'échange et aux heures notées à la proposition. Les politiques des échanges ne lisent jamais `shifts` (Postgres refuse une boucle de politiques). Une transaction qui touche plusieurs créatrices passe de l'une à l'autre par `enterCreator(tx, creatorId, allowed)`, toujours en `SET LOCAL` : la créatrice doit être dans la liste que l'appelant a vérifiée (les créatrices qui existent, les deux d'un échange, celles du membre), sinon une erreur. Un collègue ne lit jamais la ligne `team_members` d'un autre : la RLS choisit des lignes, pas des colonnes, et une politique lui ouvrirait taux, pays et statut. Son nom affiché et sa couleur, pour un échange ou la liste des candidats, passent donc par une lecture `*Unscoped` du module bornée à ces colonnes, faite après que les politiques ont montré que le lecteur a droit à l'échange ou au shift (README du module `scheduling`). Chaque écriture qui pose un shift sur un membre, et la validation d'un congé, prennent d'abord le verrou consultatif du membre (`hashtextextended('scheduling.member:' || member_id, 0)`), puis lisent ses congés.
- **Rapports et règles de paie** (EQ-03, migration 0026) : `shift_reports` suit la règle du planning, la créatrice **et** (le membre ou `owner` | `agency`). Le membre fait le rapport de son propre shift et le change tant qu'il n'est pas validé ; l'agence fait une correction (`by_agency`) ; `owner` et `agency` relisent, jamais un rapport de leur propre shift, et un manager jamais ce qu'il a envoyé lui-même (`submitted_by`) : le propriétaire relit ses propres corrections, personne ne relit pour lui. `account_pay_rules` se lit dans la créatrice par `owner` et `agency`, et par un membre qui a un shift sur le compte (la devise de ses rapports) ; seul `owner` en ajoute. Une écriture de rapport et la validation de la paie prennent le même verrou consultatif (membre, quinzaine).
- **Hors RLS** (pas de `creator_id`) : `creators`, les tables Better Auth, `invitation_links` (`withAdmin` seul), `provider_credentials` (migration 0002) et les cinq tables `telegram_*` (migration 0006), toutes retirées à `nirvana_app` (`REVOKE ALL`), `audit_log`, `worker_heartbeats`, `rate_limit_counters`, `backup_runs` et `restore_tests` (ADR 0028), les lignes `kill_switches` de scope `global` (lues par toutes les créatrices, politique `global_read` ; écrites, modifiées et supprimées seulement par `withAdmin`, migration 0010), les tables `graphile_worker`.

## Index de départ

- `messages (conversation_id, platform_created_at desc)` ; `UNIQUE (platform_account_id, platform_message_id)`
- `conversation_events (conversation_id, seq)`, `(type, created_at)` pour les vues
- `fan_facts (fan_id) where superseded_by is null` (l'expiration se filtre à la requête : `now()` est interdit dans un prédicat d'index)
- `conversations (platform_account_id, state)`, `(creator_id, last_inbound_at desc)`
- `llm_calls (creator_id, created_at)`
- `calibration_ratings (creator_id, rated_at desc)`, `(creator_id, voice_prompt, voice_model, rated_at desc)`
- `blind_tests (creator_id, voice_prompt, voice_model, persona_version_id, recorded_at desc)`
