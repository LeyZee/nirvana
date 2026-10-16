# P0-03 Base de données : schéma noyau, migrations, RLS, `withTenant`

Statut : todo
Phase : 0
Dépend de : P0-02
Branche : task/p0-03-database

## Objectif
`packages/db` fournit le schéma Drizzle du noyau, les migrations, la connexion, `withTenant`, le chiffrement des secrets, et la preuve par test que la RLS isole les créatrices.

## Contexte à lire
`docs/architecture/data-model.md`, ADR 0005, 0007, 0011, `docs/conventions/security.md` §2 et §3, `docs/conventions/testing.md` (Testcontainers).

## À faire
- `src/schema/` : `creators`, `platform_accounts`, `users` (compatible Better Auth, à confirmer avec sa doc), `audit_log`, `fans`, `fan_facts`, `fan_summaries`, `conversations`, `messages`, `conversation_events`, `drafts`, `persona_versions`, `media_assets`, `media_descriptions`, `media_sends`, `llm_calls`, `notifications`, `kill_switches`. Colonnes et contraintes de `data-model.md`, enums en `text` + `check`.
- Migrations : `drizzle-kit generate`, puis relecture et ajout manuel dans la même migration : `ENABLE ROW LEVEL SECURITY` + politiques sur toute table `creator_id`, rôles `nirvana_app` (non superuser, `BYPASSRLS` absent) et `nirvana_admin`, index de départ.
- `src/client.ts` : pool `pg`, `db` Drizzle, `withTenant(creatorId, fn)` (transaction + `SET LOCAL app.creator_id`), `withAdmin(fn)` pour les `*Unscoped`.
- `src/crypto.ts` : `encryptSecret` / `decryptSecret` AES-256-GCM avec `SESSION_ENCRYPTION_KEYS` versionnées (format `v2:…,v1:…`), testés.
- `src/test/` : helper Testcontainers (`startTestDb()`), applique les migrations, fournit un `db` par test avec rollback.
- Scripts : `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:studio` (dev seulement).

## Critères d'acceptation
- Test d'intégration : deux créatrices, des lignes dans chaque table ; `withTenant(A)` ne voit jamais les lignes de B ; un `select` hors `withTenant` sur `nirvana_app` retourne zéro ligne (pas d'erreur silencieuse : le test vérifie aussi `current_setting` absent → politique refuse).
- Test : insérer deux `messages` avec le même `(platform_account_id, platform_message_id)` échoue.
- Test : `conversation_events` refuse un `UPDATE` (trigger ou privilège) et un doublon de `(conversation_id, seq)`.
- `pnpm db:migrate` idempotent sur base vide et sur base migrée.

## Hors périmètre
Tables de la phase 6, repositories des modules (ils vivent dans chaque module).

## Notes de session
