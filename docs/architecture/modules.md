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
fans, persona ──▶ (feuilles)
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

- `eslint.config.js` : une seule règle, `boundaries/dependencies` (eslint-plugin-boundaries 7), par défaut `disallow`, dont les `policies` sont **générées** depuis la constante `MODULE_DEPENDENCIES` (le graphe ci-dessus) : une couche (`domain/`, `application/`, `infra/`) n'importe que les couches permises de son propre module et l'`index.ts` des modules listés ; le domaine n'importe ni pilote, ni framework, ni SDK, ni module Node autre que `node:crypto` ; les SDK LLM ne sortent pas de `packages/llm` (`checkAllOrigins` : les paquets externes passent par la même règle). `import-x/no-cycle` refuse les cycles. Éléments (dossiers, `partialMatch: false`) : `module-domain`, `module-application`, `module-infra`, `module` (le dossier du module, dont l'`index.ts` est la porte d'entrée), `api-root`, `api-scripts`, `api-tests`, `api-test`, `package` (le `src/` entier d'un package), `web`, `extension`, `evals`. `boundaries/root-path` est la racine du dépôt, pour que les motifs valent quel que soit le dossier d'où turbo lance ESLint. Une violation = erreur de lint = CI rouge.
- Modifier le graphe = modifier `MODULE_DEPENDENCIES` **et** ce document **et** le README des modules concernés, dans la même PR.
- `pnpm lint` fait partie de `pnpm check`.
- Un test `apps/api/src/__tests__/boundaries.test.ts` lint un mini-arbre de modules réels (`apps/api/src/__tests__/fixtures/boundaries/modules/`, exclu du lint courant et de knip) avec la vraie config, ses éléments redéclarés sur cet arbre (`boundaryElements`, exporté par `eslint.config.js`), et vérifie les règles exactes enfreintes : `conversations` → `fans/infra/...`, `persona` → `fans/index.ts` (hors graphe), `domain` → `infra`, `node:fs` dans `domain`, un cycle, et `conversations` → `fans/index.ts`, accepté. Il échoue si l'on affaiblit la règle (vérifié en passant `default` à `allow`).

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
| content (Instagram) | 7 | non créé |
| platform (Nirvana propre) | 8 | non créé, voir `own-platform.md` |

## Ajouter un module

Voir `docs/playbooks/add-a-module.md`. En bref : README d'abord (rôle, dépendances, tables), puis contrats, puis domaine testé, puis le reste, puis l'entrée dans le graphe ci-dessus et dans `eslint.config.js`.
