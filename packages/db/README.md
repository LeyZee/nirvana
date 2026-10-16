# @nirvana/db

Schéma Drizzle (`src/schema/`), migrations SQL relues (`migrations/`), client et pool, `withTenant` / `withAdmin` (RLS, ADR 0005), chiffrement des secrets (`crypto.ts`, AES-256-GCM, clés versionnées), helpers Testcontainers pour les tests d'intégration.

Commandes : `pnpm db:generate` (depuis le schéma), `pnpm db:migrate`, `pnpm db:studio` (dev).

Règles : jamais `drizzle-kit push` hors dev ; toute migration est relue avant commit et contient ses politiques RLS et index ; les migrations appliquées sont protégées (jamais modifiées, `hygiene.md`) ; expand/contract pour les changements de colonnes (`operations.md`).
