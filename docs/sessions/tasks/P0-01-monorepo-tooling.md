# P0-01 Outillage du monorepo

Statut : todo
Phase : 0
Dépend de : —
Branche : task/p0-01-monorepo-tooling

## Objectif
Rendre `pnpm install`, `pnpm check`, `pnpm test`, `pnpm dev` fonctionnels sur un squelette vide de logique, avec les frontières de modules appliquées par ESLint.

## Contexte à lire
`CLAUDE.md`, `docs/conventions/coding.md`, `docs/conventions/testing.md`, `docs/conventions/git-and-pr.md`, `docs/architecture/modules.md`, ADR 0001, 0002, 0004, 0014, 0015, `.github/workflows/ci.yml`, `scripts/check-repo.mjs`. Les fichiers de config racine (`package.json`, `eslint.config.js`, `lefthook.yml`, `knip.json`, `turbo.json`, `tsconfig.base.json`) existent déjà et sont complets : les compléter, pas les réécrire sans raison. `packages/design-system` existe déjà (fiche D-01) : il entre dans le workspace et dans `pnpm check` / `pnpm test` comme les autres.

État à l'arrivée : `pnpm install` n'a jamais tourné, il n'y a pas de `pnpm-lock.yaml`, `pnpm check` et la CI sont rouges. C'est attendu : cette fiche consiste à les rendre verts.

## À faire
- Vérifier/compléter `package.json` racine (les scripts `check`, `test`, `test:integration`, `test:all`, `db:*`, `evals` y sont déjà définis et sont la seule définition : `CLAUDE.md` et les docs les citent), `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` (flags stricts de `coding.md`), `.nvmrc` (déjà `22.11.0`), `.npmrc` (`engine-strict`, `save-exact`).
- Dépendances : mettre à jour vers les dernières versions stables (`pnpm up --latest`) puis épingler en versions exactes (pas de `^`), à la racine comme dans chaque package. Commiter `pnpm-lock.yaml`, puis remettre `cache: pnpm` dans `actions/setup-node` de `ci.yml` (retiré en attendant le lockfile).
- `"type": "module"` dans chaque `package.json`. Résolution entre packages sans étape de build en phase 0 : `exports` de chaque package pointe sur `./src/index.ts`, `moduleResolution: bundler` dans `tsconfig.base.json`, `tsx` pour lancer l'API en dev, un bundle (`tsup`) seulement pour `pnpm build`. Noter dans la fiche ce qui a été retenu si ça diffère.
- `apps/api` : `package.json`, `tsconfig.json`, `src/index.ts` (démarre un Fastify vide avec `/health`), `src/worker.ts` (vide), `src/config.ts` (Zod sur `process.env`, voir `operations.md`), `src/composition-root.ts` qui appelle déjà chaque `createXModule(deps)` vide (sinon `knip` les signale comme morts), `src/modules/*/index.ts` vides qui exportent `createXModule`.
- `packages/contracts`, `packages/db`, `packages/llm` : `package.json`, `tsconfig.json`, `src/index.ts` vides.
- `apps/web` : Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui initialisés, une page vide qui importe `@nirvana/design-system` (ADR 0015). `apps/extension` : WXT initialisé, manifeste MV3 minimal avec `host_permissions` Reveal. Ces deux apps surchargent `tsconfig.base.json` (`lib: ["DOM"]`, `jsx`, types WXT) dans leur propre `tsconfig.json`.
- Dans `evals/` : un `package.json` (`@nirvana/evals`, script `run`) et un `run.ts` stub qui explique comment lancer Promptfoo, pour que `pnpm evals` résolve ; le contenu réel arrive avec les fiches d'évals.
- `eslint.config.js` (flat) existe déjà : typescript-eslint strict, `eslint-plugin-boundaries` (règles générées depuis `MODULE_DEPENDENCIES`, éléments de `modules.md`), `eslint-plugin-import-x` (ordre, cycles), SDK LLM interdits hors `packages/llm`. Installer les plugins qu'il cite, le faire tourner, corriger ce qui casse sans affaiblir une règle.
- `.prettierrc`, `.editorconfig`, `lefthook.yml` (pre-commit : prettier, eslint, gitleaks, `check-repo --staged` ; pre-push : `pnpm check` + `pnpm test`) et `knip.json` existent déjà : vérifier qu'ils tournent (`pnpm install` installe les hooks via `prepare`). Prérequis documentés dans `docs/sessions/README.md` : Node 22, pnpm 10, Docker, `gitleaks` binaire sur le PATH.
- Vitest configuré par package ; un test trivial par package pour prouver que la chaîne tourne.
- Test `apps/api/src/__tests__/boundaries.test.ts` : exécute ESLint programmatiquement sur des fixtures permanentes dans `apps/api/src/__tests__/fixtures/boundaries/` (un import `modules/fans/infra/...` depuis `modules/conversations`, un import d'un module non autorisé par le graphe, un import d'`infra` depuis `domain`) et vérifie le `ruleId` attendu (`boundaries/element-types`, `boundaries/no-private`, `boundaries/external`). Les fixtures sont exclues du lint courant (voir `ignores` d'`eslint.config.js`).

## Critères d'acceptation
- `pnpm install --frozen-lockfile` puis `pnpm check` (typecheck + lint + prettier + knip + `check-repo`) et `pnpm test` (unitaire) verts, en local et en CI (`.github/workflows/ci.yml`, jobs `check`, `test`, `audit`, `build`). Le job `test` lance aussi `pnpm test:integration` : sans base en P0-01, cette commande doit réussir avec zéro test, pas échouer.
- `pnpm dev` lance api (`/health` répond 200) et web.
- Le test de frontières échoue si l'on retire la règle boundaries.
- `git status` propre ; `.scratch/` ignoré.

## Hors périmètre
Toute logique métier, schéma de base, routes réelles, Docker (P0-03).

## Notes de session
