# 04 · Revue des fondations (16 octobre 2026, soir)

Demande de Charles : « revue complète de l'architecture et de l'organisation du dossier : est-ce prêt, manque-t-il des choses côté métier pour les sessions IA, le nettoyage est-il automatique, est-ce qu'on s'y repère, et comment construire sans spaghetti ». Revue faite par Fable 5.1 avec un agent de relecture indépendant (30 constats), puis corrections appliquées dans le même commit que ce document.

## Verdict

**Prêt pour lancer P0-01**, à une condition déjà remplie dans ce commit : que les règles qui comptent soient vérifiées par des outils et non par la bonne volonté des sessions. Avant la revue, trois choses auraient produit du spaghetti dès la deuxième session :

1. le graphe de dépendances entre modules était décrit dans `modules.md` mais pas appliqué par ESLint (une session pouvait importer n'importe quel module) ;
2. ce graphe contenait deux cycles (`conversations ↔ connectors`, `conversations ↔ supervision`) ;
3. `pnpm check` et `pnpm test` avaient quatre définitions différentes selon le document lu.

Les trois sont corrigées. Le reste était de l'alignement de détails entre documents, utile mais pas bloquant.

## Ce qui a été corrigé

**Frontières et graphe.** `eslint.config.js` génère les règles `boundaries` depuis une seule table `MODULE_DEPENDENCIES` ; le graphe est désormais acyclique grâce à deux inversions : `conversations` définit le port `OutboundSender` que `connectors` implémente (branché dans le composition root), et `supervision` réagit aux événements de l'outbox `domain_events` au lieu d'être appelé. `modules.md`, les README de modules et les fiches P0-05/P0-06 disent la même chose. Un test de frontières sur fixtures permanentes est prévu en P0-01.

**Commandes.** `package.json` est la seule définition : `check` est statique (typecheck, lint, prettier, knip, `check-repo`), `test` est unitaire, `test:integration` lance Testcontainers, `test:all` enchaîne les deux. `CLAUDE.md`, `testing.md`, `sessions/README.md` et les fiches citent ces noms, et `scripts/check-repo.mjs` refuse une commande citée qui n'existe pas.

**Modèle de données.** `messages` est unique sur `(platform_account_id, platform_message_id)` ; ajout de `domain_events` (outbox), `worker_heartbeats` (hors RLS, lu par `/ready`), `fans.platform_meta` ; suppression de la table `approvals` (les approbations sont des événements du journal) ; section Better Auth (tables générées par sa CLI, hors RLS, champs `role` et `creator_ids`) ; RLS précisée (`FORCE`, tables possédées par `nirvana_admin`, `nirvana_app` sans `BYPASSRLS`, `USING` + `WITH CHECK`, liste des tables hors RLS).

**Développement local.** `docker-compose.yml` + `packages/db/docker/init.sql` (Postgres 16, rôles créés), un seul `.env.example` à la racine, config chargée dans `apps/api/src/config.ts`, `x-request-id` propagé comme `correlationId`.

**Hygiène automatisée.** `scripts/check-repo.mjs` dans `pnpm check` et en pré-commit : chemins cités dans les docs, index des fiches et des ADR, fichiers > 500 Ko, noms interdits (`*.bak`, `*-v2`, `old/`…), `TODO` sans identifiant de fiche, commandes citées. `knip` pour le code mort. Hooks installés par `pnpm install` (`prepare`), `gitleaks` en pré-commit et en CI. Markdown exclu de Prettier.

**Sessions en parallèle.** Chaque session écrit son journal dans son propre fichier `docs/sessions/log/<date>-<id>.md` (`LOG.md` devient un index) ; rebase sur `origin/main` avant PR, pas de commit de fusion ; Charles attribue les fiches ; `.scratch/` par fiche, `.scratch/inbox/` réservé à Charles ; statut `proposed` pour les fiches écrites par une session.

**CI.** Jobs `secrets`, `check`, `test`, `audit` (niveau high), `build`, avec timeouts, plus un job `nightly` (e2e, évals). `pull-requests: read` ajouté pour `gitleaks-action` (cause du rouge sur la PR #1 de D-01). `cache: pnpm` retiré jusqu'au lockfile (P0-01). Dependabot remplace Renovate partout, CODEOWNERS en place.

**Fiches.** P0-01 reçoit les pièges repérés (lockfile absent et `check` rouge à l'arrivée, `"type": "module"`, résolution `exports` → `src/` sans build, tsconfig des apps, stub `evals/`, composition root qui appelle les modules vides, versions épinglées exactes). P0-02 à P0-07 et H-01 alignées sur les décisions ci-dessus (`Result` maison, `uuid` v7, `/v1`, `OutboundSender`, dispatcher + file série `account:<id>` à la place d'un verrou advisory, Better Auth, CSRF par `Origin`, `SameSite=Lax`).

**Détails alignés.** Persona placeholder renommé `v0.0.0.yaml` (ADR 0010, playbook, schéma, README) ; `SESSION_ENCRYPTION_KEYS` au pluriel dans les runbooks ; jeton Cloudflare hors `.env` ; `supervision` notifie par SSE et Web Push (plus de Telegram) ; arrêt gracieux 25 s partout ; `rebuild-projections` livré en P0-05 ; glossaire complété (bulle, projection, outbox, composition root, heartbeat, correlationId, fiche proposée) ; `START-HERE` renvoie vers `api.md`, le design system et l'outillage.

## Ce qui reste, et à qui

- **P0-01** : tout ce que cette fiche liste, en particulier le lockfile et le retour de `cache: pnpm` dans la CI. Tant qu'elle n'est pas livrée, `pnpm check` est rouge et c'est attendu.
- **Charles** : révoquer les secrets commités dans Imperium ; lire les clauses d'automatisation des CGU Reveal ; fusionner la PR #1 (D-01) ou la laisser se fermer d'elle-même, ses commits étant déjà sur `main` ; décider du logo (planche v8).
- **D-01 (suite)** : composants shadcn/ui restylés, playground, test axe-core, bloqués par P0-01.
- **Bannière du README** : refaite le soir même avec le logo de Charles (`brand/banner.svg`).
- **Question ouverte** : fournisseur LLM par défaut (Grok 4.3 candidat, Mistral challenger), tranchée par les évals en P3.

## Constats de la revue non retenus

- Conteneur d'injection de dépendances : refusé, la composition manuelle suffit à cette taille et reste lisible.
- `neverthrow` : refusé au profit d'un `Result` maison de vingt lignes, pour ne pas imposer une bibliothèque à chaque module.
- Verrou advisory Postgres pour le poll : remplacé par les files série de Graphile Worker, déjà utilisées par conversation.
- Table `approvals` : supprimée, redondante avec le journal d'événements.
