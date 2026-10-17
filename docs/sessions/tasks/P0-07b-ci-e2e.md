# P0-07b CI, scripts ops, bout en bout phase 0

Statut : todo
Phase : 0
Dépend de : P0-06, P0-07a
Branche : task/p0-07b-ci-e2e

Découpée le 2026-10-17 (fil Bilan, accord du coordinateur) : l'authentification, le login et les protections HTTP sont passés dans P0-07a pour que le dashboard s'ouvre avant le moteur (P0-05, P0-06).

## Objectif
La phase 0 est acceptée : CI complète, scripts ops, et un test de bout en bout qui prouve le critère de phase.

## Contexte à lire
`docs/conventions/security.md` (tout), `docs/conventions/api.md`, `git-and-pr.md`, `testing.md`, `roadmap.md` phase 0, `.github/workflows/ci.yml`, `data-model.md` (section Better Auth).

## À faire
- CI : `.github/workflows/ci.yml` existe déjà (jobs `secrets`, `check`, `test`, `audit` niveau high, `build`, `nightly` e2e + évals) : le rendre vert de bout en bout, ajouter un service Postgres si Testcontainers ne tient pas sur les runners, activer la protection de branche sur GitHub comme `git-and-pr.md` la décrit.
- `apps/web` : appel `GET /v1/conversations` affiché en liste brute derrière le login de P0-07a.
- `audit_log` sur kill switch et prise en main (login et rôles : P0-07a).
- Scripts `pnpm ops:kill-switch`, `pnpm ops:revoke-sessions` (minimaux).
- Test e2e (Vitest + supertest ou Playwright API) : démarrer api + worker inline + `FakeConnector`, injecter un message → attendre `draft_created` → l'API retourne la conversation avec son événement et son draft vide. Vérifier qu'il ne reste rien de `demo.echo` (retiré en P0-05).
- Mettre à jour `docs/sessions/LOG.md` avec le bilan de la phase 0 et créer les fiches P2 manquantes en `proposed` si des besoins sont apparus.

## Critères d'acceptation
- CI verte sur la PR ; un secret factice ajouté dans un fichier fait échouer `gitleaks` en pre-commit et en CI.
- Test e2e phase 0 vert.
- `knip` ne signale rien ; `git status` propre.

## Hors périmètre
Design du dashboard, Cloudflare Access (configuration d'infra en phase 2, documentée dans `operations.md`).

## Notes de session
