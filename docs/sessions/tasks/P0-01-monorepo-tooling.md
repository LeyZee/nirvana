# P0-01 Outillage du monorepo

Statut : todo
Phase : 0
Dépend de : —
Branche : task/p0-01-monorepo-tooling

## Objectif
Rendre `pnpm install`, `pnpm check`, `pnpm test`, `pnpm dev` fonctionnels sur un squelette vide de logique, avec les frontières de modules appliquées par ESLint.

## Contexte à lire
`CLAUDE.md`, `docs/conventions/coding.md`, `docs/conventions/git-and-pr.md`, `docs/architecture/modules.md`, ADR 0001, 0002, 0004, 0014. Les fichiers de config racine existent déjà en version initiale : les compléter, pas les réécrire sans raison.

## À faire
- Vérifier/compléter `package.json` racine, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` (flags stricts de `coding.md`), `.nvmrc` (22), `.npmrc` (`engine-strict`, `save-exact`).
- `apps/api` : `package.json`, `tsconfig.json`, `src/index.ts` (démarre un Fastify vide avec `/health`), `src/worker.ts` (vide), `src/composition-root.ts` (vide typé), `src/modules/*/index.ts` vides qui exportent `createXModule`.
- `packages/contracts`, `packages/db`, `packages/llm` : `package.json`, `tsconfig.json`, `src/index.ts` vides.
- `apps/web` : Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui initialisés, une page vide. `apps/extension` : WXT initialisé, manifeste MV3 minimal avec `host_permissions` Reveal.
- `eslint.config.js` (flat) : typescript-eslint strict, `eslint-plugin-boundaries` avec les éléments et le graphe de `modules.md`, `eslint-plugin-import` (ordre), `no-restricted-imports` pour interdire les SDK LLM hors `packages/llm`.
- `.prettierrc`, `.editorconfig`, `lefthook.yml` (pre-commit : lint-staged + gitleaks ; pre-push : `pnpm check`), `knip.json`.
- Vitest configuré par package ; un test trivial par package pour prouver que la chaîne tourne.
- Test `apps/api/src/__tests__/boundaries.test.ts` : un import `modules/fans/infra/...` depuis `modules/conversations` est refusé par ESLint (exécuter ESLint programmatiquement sur un fichier temporaire dans le test).

## Critères d'acceptation
- `pnpm install --frozen-lockfile` puis `pnpm check` (typecheck + lint + format + knip) et `pnpm test` verts, en local et en CI (`.github/workflows/ci.yml`).
- `pnpm dev` lance api (`/health` répond 200) et web.
- Le test de frontières échoue si l'on retire la règle boundaries.
- `git status` propre ; `.scratch/` ignoré.

## Hors périmètre
Toute logique métier, schéma de base, routes réelles.

## Notes de session
