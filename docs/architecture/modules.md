# Modules et frontières

Dernière revue : 2026-10-16.

## Anatomie d'un module

```
apps/api/src/modules/<name>/
├── README.md          rôle, dépendances autorisées, tables possédées
├── index.ts           porte d'entrée publique : createXModule(deps), types, commandes
├── domain/            types, règles pures, machines d'état, erreurs. Zéro I/O.
├── application/       cas d'usage : commandes, requêtes, handlers de jobs
├── infra/             repositories Drizzle, routes Fastify, tâches Graphile, clients externes
└── __tests__/         ou *.test.ts à côté du code
```

- `domain/` importe : `packages/contracts`, d'autres fichiers de `domain/`. Rien d'autre. Pas de `node:` non plus sauf `node:crypto` pour les UUID.
- `application/` importe : `domain/`, les **ports** (interfaces) définis dans `domain/ports.ts`, `packages/contracts`, l'`index.ts` des modules autorisés par le graphe ci-dessous (et seulement ceux-là : ESLint génère la règle depuis `MODULE_DEPENDENCIES`).
- `infra/` importe : tout ce qui précède, `packages/db`, `packages/llm`, Fastify, Graphile, clients HTTP.
- Un autre module n'importe que `modules/<name>` (son `index.ts`). Jamais `modules/<name>/infra/...`.

## Graphe de dépendances autorisé

```
connectors ──▶ conversations (événements entrants : IngestMessage, SessionStateChanged, SaleDetected)
conversations ──▶ fans, persona, agent, media
agent ──▶ fans, persona, media, packages/llm
supervision ──▶ conversations, fans
media ──▶ packages/llm
sales ──▶ conversations, media            (phase 6)
scripts ──▶ sales, media, conversations   (phase 6)
playground ──▶ agent, packages/llm        (écran Entraîner, P3-06)
fans, persona, providers ──▶ (feuilles)
```

Ce graphe est **sans cycle**, et `import-x/no-cycle` le vérifie. Deux inversions le rendent possible :

- **Envoi** : `conversations` ne dépend pas de `connectors`. Il définit le port `OutboundSender` (`sendText`, `sendMedia`, `verifySent`) dans `conversations/domain/ports.ts` ; `connectors` l'implémente et le composition root l'injecte dans `createConversationsModule(deps)`.
- **Supervision** : `conversations` ne dépend pas de `supervision`. `supervision` apprend qu'un draft existe par l'événement `draft_created` (outbox), et agit sur les conversations par leur `index.ts` (`approveDraft`, `takeover`, …).

Un cycle est une erreur de conception, pas un cas à autoriser. Si `fans` a besoin de `conversations`, c'est que la responsabilité est au mauvais endroit, ou qu'il faut un événement.

## Communication entre modules

1. **Appel direct** via l'`index.ts` du module cible, pour les lectures et les commandes synchrones simples.
2. **Événements de domaine** pour tout ce qui doit être découplé ou différé : un module écrit un événement dans `conversation_events` (ou `domain_events` pour le hors-conversation) **dans la même transaction** que son changement d'état (outbox). Un job Graphile les distribue aux abonnés. C'est ainsi que `supervision` apprend qu'un draft existe, que `fans` apprend qu'un fait est confirmé, que `sales` apprend qu'un envoi payant a eu lieu.
3. **Jobs** pour le travail asynchrone (`conversation.respond`, `media.describe`, `fans.refresh_summary`, `conversation.follow_up`, `connector.poll`, `connector.reconcile`). Nom = `<module>.<verbe>`.

## Propriété des tables

Chaque table a exactement un module propriétaire (voir le README de chaque module). Un module lit les tables des autres **uniquement** via leur `index.ts` (requêtes exposées), jamais par SQL direct. Les vues SQL du tableau de bord (`apps/api/src/modules/supervision/infra/views/`) sont l'exception documentée : lecture seule, agrégats.

## Application des règles

- `eslint.config.js` : la constante `MODULE_DEPENDENCIES` reproduit le graphe ci-dessus et **génère** les politiques de la règle `boundaries/dependencies` (eslint-plugin-boundaries 7, `default: disallow`) : un module n'importe que l'`index.ts` des modules listés, jamais leurs dossiers internes ; `domain/` n'importe que son propre `domain/` et `@nirvana/contracts`, sans I/O (ni `node:*` sauf `node:crypto`, ni Drizzle, Fastify, Graphile, `pg`, `undici`) ; les SDK LLM sont interdits hors `packages/llm`. `import-x/no-cycle` interdit les cycles. Éléments : `module` (un dossier `apps/api/src/modules/<nom>`, ses couches `domain`, `application`, `infra`, `index.ts` distinguées par leur chemin interne), `api-root`, `api-scripts`, `api-tests`, `api-test`, `package`, `web`, `extension`, `evals`. Le test `apps/api/src/__tests__/boundaries.test.ts` prouve chaque protection sur des fixtures. Une violation = erreur de lint = CI rouge.
- Modifier le graphe = modifier `MODULE_DEPENDENCIES` **et** ce document **et** le README des modules concernés, dans la même PR.
- `pnpm lint` fait partie de `pnpm check`.
- Un test `apps/api/src/__tests__/boundaries.test.ts` lint des fixtures permanentes (`apps/api/src/__tests__/fixtures/boundaries/`, incluses dans le tsconfig) et vérifie le `ruleId` exact : `conversations` → `fans/infra/...` refusé, `fans` → `conversations/index.ts` refusé (hors graphe), `conversations` → `fans/index.ts` accepté.

## Modules et phases

| Module | Phase d'apparition | État |
|---|---|---|
| connectors | 0 (Fake), 2 (Reveal) | squelette |
| conversations | 0 | squelette |
| fans | 3 | squelette |
| persona | 3 | squelette |
| agent | 3 | squelette |
| media | 3 (sens), 6 (catalogue) | squelette |
| supervision | 4 | squelette |
| sales | 6 | réservé |
| scripts | 6 | réservé |
| playground | 3 | API de l'écran Entraîner (P3-06) |
| providers (clés des services IA, ADR 0016) | 3 | domaine, application et vérificateurs ; magasin Postgres et routes à venir (P3-03) |
| content (Instagram) | 7 | non créé |
| platform (Nirvana propre) | 8 | non créé, voir `own-platform.md` |

## Ajouter un module

Voir `docs/playbooks/add-a-module.md`. En bref : README d'abord (rôle, dépendances, tables), puis contrats, puis domaine testé, puis le reste, puis l'entrée dans le graphe ci-dessus et dans `eslint.config.js`.
