# P0-04 Serveur Fastify et worker Graphile, composition root, santé

Statut : todo
Phase : 0
Dépend de : P0-03
Branche : task/p0-04-server-and-worker

## Objectif
Un processus API et un processus worker qui partagent le même composition root, démarrent et s'arrêtent proprement, exposent `/health` et `/ready`, et exécutent un job de démonstration via Graphile Worker avec la file série par conversation.

## Contexte à lire
ADR 0004, 0006, `docs/architecture/operations.md` (déploiement, santé, arrêt), `docs/conventions/security.md` §6 (web/API), `docs/conventions/coding.md` (logging, async).

## À faire
- `apps/api/src/server.ts` : Fastify 5 + `fastify-type-provider-zod`, pino (redaction des champs sensibles), helmet, cors (origine du dashboard seulement), rate-limit, gestion d'erreurs centrale (`DomainError` → 4xx typé, le reste → 500 sans détail), `/health` (process vivant), `/ready` (base joignable + migrations à jour + worker vu récemment).
- `apps/api/src/worker.ts` : Graphile Worker (`run` avec `taskList` fourni par le composition root), crontab chargé depuis `apps/api/crontab`, heartbeat écrit en base toutes les 30 s (lu par `/ready`).
- `apps/api/src/composition-root.ts` : charge la config (Zod sur `process.env`, échec explicite si manquante), construit `db`, construit chaque module via `createXModule(deps)` (vides pour l'instant), expose `{ routes, tasks, shutdown }`.
- Arrêt gracieux : SIGTERM → arrêt d'acceptation, fin des jobs en cours (max 25 s), fermeture du pool.
- Job de démonstration `demo.echo` avec `queueName` et `jobKey` pour prouver série et remplacement ; retiré en P0-05 (noter dans la fiche d'hygiène).
- `apps/api/.env.example` complété ; `pnpm dev` lance api + worker dans un même processus (`NIRVANA_INLINE_WORKER=1`).

## Critères d'acceptation
- Test d'intégration : 10 jobs `demo.echo` sur `queueName: 'conv:x'` s'exécutent dans l'ordre, jamais en parallèle (horodatages disjoints) ; 5 jobs avec le même `jobKey` et `replace` n'en exécutent qu'un.
- `/ready` passe à 503 si la base est coupée et si le worker n'a pas écrit son heartbeat depuis 90 s.
- SIGTERM pendant un job : le job finit, le processus sort avec le code 0.
- Aucune route n'accepte de corps non validé (test : corps invalide → 400 avec erreur Zod structurée).

## Hors périmètre
Auth (P0-07), modules métier.

## Notes de session
