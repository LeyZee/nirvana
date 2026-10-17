# P0-03 Base de données : schéma noyau, migrations, RLS, `withTenant`

Statut : done
Phase : 0
Dépend de : P0-02
Branche : task/p0-03-database

## Objectif
`packages/db` fournit le schéma Drizzle du noyau, les migrations, la connexion, `withTenant`, le chiffrement des secrets, et la preuve par test que la RLS isole les créatrices.

## Contexte à lire
`docs/architecture/data-model.md` (dont les sections Better Auth, RLS et Système), ADR 0005, 0007, 0011, `docs/conventions/security.md` §2 et §3, `docs/conventions/testing.md` (Testcontainers), `docker-compose.yml` et `packages/db/docker/init.sql` (Postgres de dev, rôles).

## À faire
- `src/schema/` : `creators`, `platform_accounts`, `audit_log`, `fans` (avec `platform_meta` jsonb), `fan_facts`, `fan_summaries`, `conversations`, `messages`, `conversation_events`, `domain_events`, `drafts`, `persona_versions`, `media_assets`, `media_descriptions`, `media_sends`, `llm_calls`, `notifications`, `kill_switches`, `worker_heartbeats`. Colonnes et contraintes de `data-model.md`, enums en `text` + `check`, colonnes SQL en snake_case et clés `jsonb` en camelCase.
- `src/schema/auth.ts` : les tables Better Auth (`user`, `session`, `account`, `verification`) générées par sa CLI (`npx @better-auth/cli generate`), plus les champs `role` et `creator_ids` sur `user` ; hors RLS, documentées dans `data-model.md`.
- Migrations : `drizzle-kit generate`, puis relecture et ajout manuel dans la même migration : `ENABLE` et `FORCE ROW LEVEL SECURITY` + politiques `USING` et `WITH CHECK` (`creator_id = NULLIF(current_setting('app.creator_id', true), '')::uuid`) sur toute table `creator_id` ; tables possédées par `nirvana_admin`, `nirvana_app` (`NOBYPASSRLS`) n'a que des droits DML ; liste des tables hors RLS telle que `data-model.md` la fixe ; index de départ (dont l'unique `(platform_account_id, platform_message_id)` sur `messages`). Les rôles sont créés par `packages/db/docker/init.sql` en dev et par le runbook en prod.
- `src/client.ts` : pool `pg`, `db` Drizzle, `withTenant(creatorId, fn)` (transaction + `SET LOCAL app.creator_id`), `withAdmin(fn)` pour les `*Unscoped`.
- `src/crypto.ts` : `encryptSecret` / `decryptSecret` AES-256-GCM avec `SESSION_ENCRYPTION_KEYS` versionnées (format `v2:…,v1:…`), testés.
- `src/test/` : helper Testcontainers (`startTestDb()`), applique les migrations, une base par fichier de test, un `db` par test avec rollback (`testing.md`).
- Scripts : `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:studio` (dev seulement), déjà déclarés à la racine. Dev local : `docker compose up -d` (Postgres 16, `init.sql`), `DATABASE_URL` de `.env.example`.

## Critères d'acceptation
- Test d'intégration : deux créatrices, des lignes dans chaque table ; `withTenant(A)` ne voit jamais les lignes de B ; un `select` hors `withTenant` sur `nirvana_app` retourne zéro ligne (pas d'erreur silencieuse : le test vérifie aussi `current_setting` absent → politique refuse).
- Test : insérer deux `messages` avec le même `(platform_account_id, platform_message_id)` échoue.
- Test : `conversation_events` refuse un `UPDATE` (trigger ou privilège) et un doublon de `(conversation_id, seq)`.
- `pnpm db:migrate` idempotent sur base vide et sur base migrée.

## Hors périmètre
Tables de la phase 6, repositories des modules (ils vivent dans chaque module).

## Notes de session

## Résultat (2026-10-17)

Fait : schéma des 19 tables du noyau et des 4 tables Better Auth (`src/schema/`, un fichier par module), migration `0000_core.sql` générée puis complétée à la main (`FORCE ROW LEVEL SECURITY` sur les 16 tables à `creator_id`, triggers append-only sur `conversation_events`, `domain_events`, `audit_log`, `GRANT` DML à `nirvana_app`), politiques déclarées dans le schéma (`tenantPolicy`, `tenantOrGlobalPolicy` pour les kill switches globaux), `createDbClient`, `withTenant`, `withAdmin`, `encryptSecret` / `decryptSecret` (AES-256-GCM, clés versionnées, contexte lié en données associées), `runMigrations` et `pnpm db:migrate`, helpers Testcontainers.

Tests : 25 d'intégration (isolation de chaque table, zéro ligne hors `withTenant`, pas de fuite du réglage entre transactions du pool, écriture croisée refusée, admin sans superutilisateur qui traverse les tenants, unicité des messages, journal append-only et `seq` unique, `check` des listes fermées, migration idempotente) et 4 unitaires sur le chiffrement.

Écarts : index des faits actifs sans `expires_at > now()` (interdit dans un prédicat d'index) ; tables Better Auth écrites d'après son schéma de base, à comparer à sa CLI dans P0-07 ; `NIRVANA_TEST_PG_URL` permet les tests d'intégration sans Docker.
