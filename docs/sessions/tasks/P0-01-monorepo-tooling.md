# P0-01 Outillage du monorepo

Statut : done
Phase : 0
Dépend de : —
Branche : task/p0-01-monorepo-tooling

## Objectif
Rendre `pnpm install`, `pnpm check`, `pnpm test`, `pnpm dev` fonctionnels sur un squelette vide de logique, avec les frontières de modules appliquées par ESLint.

## Contexte à lire
`CLAUDE.md`, `docs/conventions/coding.md`, `docs/conventions/testing.md`, `docs/conventions/git-and-pr.md`, `docs/architecture/modules.md`, ADR 0001, 0002, 0004, 0014, 0015, `.github/workflows/ci.yml`, `scripts/check-repo.mjs`. Les fichiers de config racine (`package.json`, `eslint.config.js`, `lefthook.yml`, `knip.json`, `turbo.json`, `tsconfig.base.json`) existent déjà et sont complets : les compléter, pas les réécrire sans raison. `packages/design-system` existe déjà (fiche D-01) : il entre dans le workspace et dans `pnpm check` / `pnpm test` comme les autres.

État à l'arrivée (16/10) : `pnpm-lock.yaml` existe et la CI est verte, mais le workspace ne contient que la racine et `packages/design-system`. Cette fiche ajoute les autres packages sans casser ce vert.

## À faire
- Vérifier/compléter `package.json` racine (les scripts `check`, `test`, `test:integration`, `test:all`, `db:*`, `evals` y sont déjà définis et sont la seule définition : `CLAUDE.md` et les docs les citent), `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` (flags stricts de `coding.md`), `.nvmrc` (`22.22.0` ; plusieurs dépendances exigent au moins Node 22.13), `.npmrc` (`engine-strict`, `save-exact`).
- Dépendances : mettre à jour vers les dernières versions stables (`pnpm up --latest`) puis épingler en versions exactes (pas de `^`), à la racine comme dans chaque package. Commiter le `pnpm-lock.yaml` mis à jour. Garder `pnpm audit --audit-level high` vert : les correctifs transitifs (`overrides`) et l'unique exception (`auditConfig.ignoreGhsas`, braces sans version corrigée) sont dans `pnpm-workspace.yaml`, chacun avec sa raison ; retirer une entrée dès que le paquet parent embarque le correctif. Vitest est en 4.x (Vitest 5 exige Node ≥ 22.12, au-dessus de `.nvmrc`).
- `"type": "module"` dans chaque `package.json`. Résolution entre packages sans étape de build en phase 0 : `exports` de chaque package pointe sur `./src/index.ts`, `moduleResolution: bundler` dans `tsconfig.base.json`, `tsx` pour lancer l'API en dev, un bundle (`tsup`) seulement pour `pnpm build`. Noter dans la fiche ce qui a été retenu si ça diffère.
- `apps/api` : `package.json`, `tsconfig.json`, `src/index.ts` (démarre un Fastify vide avec `/health`), `src/worker.ts` (vide), `src/config.ts` (Zod sur `process.env`, voir `operations.md`), `src/composition-root.ts` qui appelle déjà chaque `createXModule(deps)` vide (sinon `knip` les signale comme morts), `src/modules/*/index.ts` vides qui exportent `createXModule`.
- `packages/contracts`, `packages/db`, `packages/llm` : `package.json`, `tsconfig.json`, `src/index.ts` vides.
- `apps/web` : Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui initialisés, une page vide qui importe `@nirvana/design-system` (ADR 0015). `apps/extension` : WXT initialisé, manifeste MV3 minimal avec `host_permissions` Reveal. Ces deux apps surchargent `tsconfig.base.json` (`lib: ["DOM"]`, `jsx`, types WXT) dans leur propre `tsconfig.json`.
- Dans `evals/` : un `package.json` (`@nirvana/evals`, script `run`) et un `run.ts` stub qui explique comment lancer Promptfoo, pour que `pnpm evals` résolve ; le contenu réel arrive avec les fiches d'évals.
- `eslint.config.js` (flat) existe déjà : typescript-eslint strict, `eslint-plugin-boundaries` (règles générées depuis `MODULE_DEPENDENCIES`, éléments de `modules.md`), `eslint-plugin-import-x` (ordre, cycles), SDK LLM interdits hors `packages/llm`. Installer les plugins qu'il cite, le faire tourner, corriger ce qui casse sans affaiblir une règle. État vérifié le 16/10 (revue `brainstorm/05-revue-independante.md`) avec `eslint-plugin-boundaries` 5.4 et 7.2 : la config charge, et les quatre protections se déclenchent depuis la racine comme depuis `apps/api` (import d'`infra` d'un autre module, module hors graphe, `node:fs` dans `domain`, cycle). Elles reposent sur trois réglages à ne pas retirer : `boundaries/root-path`, `import/resolver` (typescript) et `import-x/parsers`. `pnpm up --latest` fait passer boundaries en 7.x : la config marche mais émet des avertissements de syntaxe dépréciée ; migrer vers la règle `boundaries/dependencies` dans cette fiche, le test de frontières servant de filet.
- `.prettierrc`, `.editorconfig`, `lefthook.yml` (pre-commit : prettier, eslint, gitleaks, `check-repo --staged` ; pre-push : `pnpm check` + `pnpm test`) et `knip.json` existent déjà : vérifier qu'ils tournent (`pnpm install` installe les hooks via `prepare`). Prérequis documentés dans `docs/sessions/README.md` : Node 22, pnpm 10, Docker, `gitleaks` binaire sur le PATH.
- Vitest configuré par package ; un test trivial par package pour prouver que la chaîne tourne.
- Test `apps/api/src/__tests__/boundaries.test.ts` : exécute ESLint programmatiquement sur des fixtures permanentes dans `apps/api/src/__tests__/fixtures/boundaries/` (un import `modules/fans/infra/...` depuis `modules/conversations`, un import d'un module non autorisé par le graphe, un `node:fs` dans `domain`, un cycle) et vérifie le `ruleId` attendu (`boundaries/element-types` ou `boundaries/dependencies`, `boundaries/no-private`, `boundaries/external`, `import-x/no-cycle`). Piège : les éléments sont reconnus par leur chemin (`apps/api/src/modules/*/…`) et les imports doivent se résoudre vers des fichiers réels ; les fixtures reproduisent donc un mini-arbre `modules/` complet, et le test construit l'`ESLint` avec un `overrideConfig` qui redéclare les `boundaries/elements` avec la racine des fixtures (`MODULE_DEPENDENCIES` est exporté pour ça). Ajouter les fixtures aux `ignores` d'`eslint.config.js` pour le lint courant et passer `ignore: false` dans le test.
- Pièges d'outillage repérés à la revue : (1) `prepare: lefthook install` échoue hors dépôt git, donc dans un build Docker : le rendre tolérant (ex. `lefthook install || echo skipped`, qui marche aussi sous Windows). (2) pnpm 10 bloque les scripts d'installation (`esbuild`, `lefthook`, `unrs-resolver`) : décider `onlyBuiltDependencies` dans `pnpm-workspace.yaml`. (3) `tsconfig.base.json` est en `NodeNext` alors que cette fiche propose `bundler` : trancher et l'écrire. (4) `turbo.json` fait dépendre `typecheck` et `test` de `^build` : inutile si les `exports` pointent sur `src/`.

## Critères d'acceptation
- `pnpm install --frozen-lockfile` puis `pnpm check` (typecheck + lint + prettier + knip + `check-repo`) et `pnpm test` (unitaire) verts, en local et en CI (`.github/workflows/ci.yml`, jobs `check`, `test`, `audit`, `build`). Le job `test` lance aussi `pnpm test:integration` : sans base en P0-01, cette commande doit réussir avec zéro test, pas échouer.
- `pnpm dev` lance api (`/health` répond 200) et web.
- Le test de frontières échoue si l'on retire la règle boundaries.
- `git status` propre ; `.scratch/` ignoré.

## Hors périmètre
Toute logique métier, schéma de base, routes réelles, Docker (P0-03).

## Notes de session

2026-10-16/17 (Opus 5.5). Ce qui a été retenu, et les écarts :

- **Versions** : dernières stables publiées depuis au moins 14 jours (`minimumReleaseAge`), en versions exactes : ESLint 10, typescript-eslint 8.71, eslint-plugin-boundaries 7.2, knip 6, lefthook 2, Vite 8, WXT 0.21, Vitest 4.1.11 (la 4.1.12 a un jour ; la 4.1.11 contient déjà le correctif de sécurité). Écarts : TypeScript 6.0.3 (typescript-eslint refuse TS 7) ; `@types/node` 22 (types du Node d'exécution) ; tsup 8.5.1 (la 9 a deux jours). Node : `.nvmrc` 22.22.0, `engines >=22.13` (Vite 8 exige 22.12).
- **boundaries 7** : migration faite vers la règle unique `boundaries/dependencies` (sélecteurs `{ element: … }`, `policies`, éléments en dossiers avec `partialMatch: false`, `fileInternalPath: 'index.ts'` pour la porte d'entrée d'un module, `checkAllOrigins` à la place de `boundaries/external`, plus de `no-private` séparé : les politiques par couche le couvrent). Aucun avertissement de dépréciation. Vérifié sur 20 imports connus, puis par le test de frontières.
- **Correctifs de config** : un package est un seul élément (`packages/*/src`), sinon son `index.ts` était « privé » et `apps/web` ne pouvait pas importer `@nirvana/design-system` ; `.wxt/` et les fixtures ignorés par ESLint ; le résolveur couvre `evals/`.
- **Test de frontières** : mini-arbre réel dans `fixtures/boundaries/modules/`, éléments redéclarés avec `boundaryElements` (exporté par `eslint.config.js`, typé par `eslint.config.d.ts`), `ignore: false`, six cas dont un cycle (`import-x/no-cycle`). Échoue si la règle est affaiblie.
- **Résolution** : `moduleResolution: Bundler` et `module: ESNext` dans `tsconfig.base.json`, `exports` sur `./src/index.ts`, `tsx` en dev (`--env-file-if-exists=../../.env`), tsup pour le build de l'API (packages `@nirvana/*` embarqués ; `node dist/index.js` répond 200). `turbo.json` : `typecheck` et `test` ne dépendent plus de `^build`.
- **Config** : `apps/api/src/config.ts` valide `NODE_ENV`, `LOG_LEVEL`, `PORT` ; les autres variables de `.env.example` arrivent avec leurs fiches. Le composition root porte la config.
- **Install** : `onlyBuiltDependencies` = `esbuild` seul (lefthook s'installe par `prepare`, `unrs-resolver` fonctionne sans son script) ; `prepare` tolère l'absence de dépôt git (`lefthook install || echo …`). Exception de quarantaine `handlebars` 4.7.10 (correctif de sécurité), faille `braces` ignorée (sans correctif) : `pnpm-workspace.yaml`, `security.md`.
- **Hooks et scripts** : `commit-msg` déplacé dans `.lefthook/commit-msg/conventional.sh` (le `sh` de lefthook sous Windows ne lisait pas la commande multiligne) ; `--no-warn-ignored` sur le lint de pré-commit ; `scripts/check-repo.mjs` normalise ses chemins en `/` (sous Windows il ne s'excluait pas lui-même).
- **Formatage** : `.gitattributes` force LF (sinon `prettier --check` échoue sous Windows) ; `personas/` exclu de Prettier (donnée versionnée, ADR 0010).
- **`pnpm dev`** : api + web seulement (`wxt dev` ouvre un navigateur). **`pnpm evals`** : `pnpm --filter @nirvana/evals run run` (avec un seul `run`, pnpm liste les scripts au lieu d'exécuter `run`).
- **turbo** : `"agentGuidance": false`, sinon turbo écrit un `AGENTS.md` à chaque commande lancée par un agent.
- Favicon de `brand/` copié dans `apps/web/public/` ; l'extension attend des icônes PNG (non générées).
