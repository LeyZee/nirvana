# P0-07 CI, hooks, sécurité de base, bout en bout phase 0

Statut : todo
Phase : 0
Dépend de : P0-06
Branche : task/p0-07-ci-security-e2e

## Objectif
La phase 0 est acceptée : CI complète, authentification du dashboard, protections HTTP, et un test de bout en bout qui prouve le critère de phase.

## Contexte à lire
`docs/conventions/security.md` (tout), `git-and-pr.md`, `testing.md`, `roadmap.md` phase 0, `.github/workflows/ci.yml`.

## À faire
- CI : jobs `check`, `test` (avec Postgres via Testcontainers ou service), `gitleaks`, `audit` (pnpm audit niveau high), `build` ; cache pnpm ; protection de branche documentée dans `git-and-pr.md`.
- Better Auth dans `apps/api` : email + mot de passe (ou passkey) pour `owner`/`operator`, cookies `HttpOnly Secure SameSite=Strict`, sessions en base, `requireRole()` ; `audit_log` sur login, changement de rôle, kill switch, prise en main.
- `apps/web` : page de connexion, garde de route, appel `GET /conversations` affiché en liste brute (pas de design encore).
- Protection CSRF (`@fastify/csrf-protection` ou double-submit), CORS strict, en-têtes helmet vérifiés par test, rate limit sur `/auth/*` et `/connector/sessions`.
- Scripts `pnpm ops:kill-switch`, `pnpm ops:revoke-sessions` (minimaux).
- Test e2e (Vitest + supertest ou Playwright API) : démarrer api + worker inline + `FakeConnector`, injecter un message → attendre `draft_created` → l'API retourne la conversation avec son événement et son draft vide. Retirer `demo.echo` (P0-04).
- Mettre à jour `docs/sessions/LOG.md` avec le bilan de la phase 0 et créer les fiches P2 manquantes en `proposed` si des besoins sont apparus.

## Critères d'acceptation
- CI verte sur la PR ; un secret factice ajouté dans un fichier fait échouer `gitleaks` en pre-commit et en CI.
- Test : requête sans cookie → 401 ; `operator` sur une route `owner` → 403 ; CSRF manquant → 403.
- Test e2e phase 0 vert.
- `knip` ne signale rien ; `git status` propre.

## Hors périmètre
Design du dashboard, Cloudflare Access (configuration d'infra en phase 2, documentée dans `operations.md`).

## Notes de session
