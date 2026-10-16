# 0004. Fastify plutôt que NestJS

Statut : accepted
Date : 2026-10-16

## Contexte

Il faut un serveur HTTP (API du dashboard, endpoint de l'extension, SSE) et un worker de jobs partageant le même code. NestJS apporte modules et DI intégrés, mais impose des décorateurs, un conteneur, et une couche d'abstraction épaisse.

## Décision

- **Fastify 5** avec `fastify-type-provider-zod` pour valider et typer entrées/sorties à partir des schémas de `packages/contracts`, `pino` pour les logs, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cors`.
- Les routes sont déclarées dans `infra/http/` de chaque module et enregistrées par le composition root ; elles ne contiennent aucune logique métier (elles appellent `application/`).
- Le worker (Graphile) tourne dans le même processus en dev et dans un processus séparé en prod (`node dist/worker.js`), avec le même composition root.

## Conséquences

- Simplicité et performance ; pas de magie, chaque dépendance est visible.
- Les frontières de modules sont tenues par ESLint (ADR 0002), pas par un framework.
- Coût : quelques conventions à écrire nous-mêmes (gestion d'erreurs, auth), prévues en P0.

## Alternatives rejetées

- **NestJS** : DI et modules intégrés, mais décorateurs, conteneur, et une structure qui dicte plus qu'elle n'aide ; les frontières y sont des conventions, pas des règles vérifiées.
- **Hono** : excellent, mais l'écosystème de plugins (auth, rate limit, SSE) est moins mûr côté Node long-running.
- **Express** : non typé, pas de validation intégrée, peu de raisons en 2026.
