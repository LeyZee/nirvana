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
- `application/` importe : `domain/`, les **ports** (interfaces) définis dans `domain/` ou `application/ports.ts`, `packages/contracts`, l'`index.ts` d'autres modules autorisés.
- `infra/` importe : tout ce qui précède, `packages/db`, `packages/llm`, Fastify, Graphile, clients HTTP.
- Un autre module n'importe que `modules/<name>` (son `index.ts`). Jamais `modules/<name>/infra/...`.

## Graphe de dépendances autorisé

```
connectors ──▶ conversations (événements entrants : IngestMessage, SessionStateChanged, SaleDetected)
conversations ──▶ fans, persona, agent, supervision, connectors (port d'envoi), media
agent ──▶ fans, persona, media, packages/llm
supervision ──▶ conversations, fans
media ──▶ packages/llm
sales ──▶ conversations, media            (phase 6)
scripts ──▶ sales, media, conversations   (phase 6)
fans, persona ──▶ (feuilles)
```

Un cycle est une erreur de conception, pas un cas à autoriser. Si `fans` a besoin de `conversations`, c'est que la responsabilité est au mauvais endroit, ou qu'il faut un événement.

## Communication entre modules

1. **Appel direct** via l'`index.ts` du module cible, pour les lectures et les commandes synchrones simples.
2. **Événements de domaine** pour tout ce qui doit être découplé ou différé : un module écrit un événement dans `conversation_events` (ou `domain_events` pour le hors-conversation) **dans la même transaction** que son changement d'état (outbox). Un job Graphile les distribue aux abonnés. C'est ainsi que `supervision` apprend qu'un draft existe, que `fans` apprend qu'un fait est confirmé, que `sales` apprend qu'un envoi payant a eu lieu.
3. **Jobs** pour le travail asynchrone (`conversation.respond`, `media.describe`, `fans.refresh_summary`, `conversation.follow_up`, `connector.poll`, `connector.reconcile`). Nom = `<module>.<verbe>`.

## Propriété des tables

Chaque table a exactement un module propriétaire (voir le README de chaque module). Un module lit les tables des autres **uniquement** via leur `index.ts` (requêtes exposées), jamais par SQL direct. Les vues SQL du tableau de bord (`apps/api/src/modules/supervision/infra/views/`) sont l'exception documentée : lecture seule, agrégats.

## Application des règles

- `eslint.config.js` : `boundaries/element-types` et `boundaries/no-private` avec les éléments `module-domain`, `module-application`, `module-infra`, `module-index`, `package`. Une violation = erreur de lint = CI rouge.
- `pnpm lint` fait partie de `pnpm check`.
- Un test `apps/api/src/__tests__/boundaries.test.ts` vérifie que la config boundaries refuse bien un import interdit connu (pour ne pas désactiver la règle par accident).

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
