# Git et pull requests

## Branches

- `main` : protégée, toujours déployable. PR obligatoire, CI verte, un approbateur (Charles, ou Fable pour les PR structurantes).
- `task/<id>-<slug>` : une branche par fiche de tâche. Supprimée après fusion (squash).
- Pas de branche longue durée. Une fiche qui dure plus d'une semaine est trop grosse : on la découpe.

## Commits

Conventional Commits, en anglais, impératif, scope = module ou package :

```
feat(conversations): ingest messages idempotently by platform_message_id
fix(connectors): retry listConversations on 502 with backoff
chore(cleanup): remove unused fixtures from media tests
docs(adr): propose 0015 config loading
test(agent): cover disgust guard with persona fixtures
refactor(fans): extract fact retention into domain
```

Un commit compile et passe `pnpm check`. Pas de `wip`. Pas de secret, évidemment.

## Pull requests

- Titre : `<id> <titre de la fiche>` (ex. `P0-03 Bootstrap de l'API et ingestion`).
- Corps : le template `.github/pull_request_template.md`. « Avant » / « Après » en français simple, puis « Comment », puis la checklist. Les deux lignes d'attribution demandées par le projet restent en tête.
- Petites : < 500 lignes de diff hors tests et fichiers générés. Au-delà, on découpe.
- Une PR = une fiche. Pas de « tant que j'y étais ».
- Fusion par squash, message = titre de la PR.

## Revue

Ce que le relecteur regarde, dans l'ordre : (1) frontières et contrats respectés, (2) tests présents et pertinents, (3) sécurité (checklist de `security.md`), (4) hygiène (rien de parasite), (5) docs à jour, (6) lisibilité. Le style est l'affaire de Prettier et ESLint, pas de la revue.

## Releases

Pas de versionnage sémantique du produit pour l'instant : chaque fusion sur `main` est une release, identifiée par son SHA (Sentry, Coolify). Un `CHANGELOG.md` sera introduit quand une deuxième créatrice ou un deuxième opérateur en aura besoin.
