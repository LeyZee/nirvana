# P0-07 CI, hooks, sécurité de base, bout en bout phase 0

Statut : todo
Phase : 0
Dépend de : P0-06
Branche : task/p0-07-ci-security-e2e

## Objectif
La phase 0 est acceptée : CI complète, authentification du dashboard, protections HTTP, et un test de bout en bout qui prouve le critère de phase.

## Contexte à lire
`docs/conventions/security.md` (tout), `docs/conventions/api.md`, `git-and-pr.md`, `testing.md`, `roadmap.md` phase 0, `.github/workflows/ci.yml`, `data-model.md` (section Better Auth).

## À faire
- CI : `.github/workflows/ci.yml` existe déjà (jobs `secrets`, `check`, `test`, `audit` niveau high, `build`, `nightly` e2e + évals) : le rendre vert de bout en bout, ajouter un service Postgres si Testcontainers ne tient pas sur les runners, activer la protection de branche sur GitHub comme `git-and-pr.md` la décrit.
- Better Auth dans `apps/api` (tables générées en P0-03, `schema/auth.ts`) : email + mot de passe pour `owner`/`operator` (passkeys plus tard), cookies `HttpOnly Secure SameSite=Lax`, sessions en base, `requireRole()` ; `audit_log` sur login, changement de rôle, kill switch, prise en main.
- `apps/web` : page de connexion, garde de route, appel `GET /v1/conversations` affiché en liste brute (le design system existe, D-01, mais aucun écran n'est dessiné ici).
- CSRF par vérification de l'en-tête `Origin` sur toute mutation contre la liste des origines autorisées (`security.md` §6, pas de jeton séparé), CORS strict sur la même liste, en-têtes helmet vérifiés par test, rate limit sur `/v1/auth/*` et `/v1/connector/sessions`.
- Scripts `pnpm ops:kill-switch`, `pnpm ops:revoke-sessions` (minimaux).
- Test e2e (Vitest + supertest ou Playwright API) : démarrer api + worker inline + `FakeConnector`, injecter un message → attendre `draft_created` → l'API retourne la conversation avec son événement et son draft vide. Retirer `demo.echo` (P0-04).
- Mettre à jour `docs/sessions/LOG.md` avec le bilan de la phase 0 et créer les fiches P2 manquantes en `proposed` si des besoins sont apparus.

## Critères d'acceptation
- CI verte sur la PR ; un secret factice ajouté dans un fichier fait échouer `gitleaks` en pre-commit et en CI.
- Test : requête sans cookie → 401 ; `operator` sur une route `owner` → 403 ; mutation avec `Origin` absent ou étranger → 403.
- Test e2e phase 0 vert.
- `knip` ne signale rien ; `git status` propre.

## Hors périmètre
Design du dashboard, Cloudflare Access (configuration d'infra en phase 2, documentée dans `operations.md`).

## Notes de session
