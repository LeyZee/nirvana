# P0-07a Authentification du dashboard, rôles, CSRF, page de connexion

Statut : todo
Phase : 0
Dépend de : P0-04
Branche : task/p0-07a-auth-and-login

Découpée de P0-07 le 2026-10-17 : le dashboard doit s'ouvrir (login, rôles) avant le moteur, pour que P3-03 (connexion des services IA) avance en parallèle de P0-05 et P0-06.

## Objectif
Un opérateur se connecte au dashboard avec email et mot de passe, l'API connaît son rôle, et toute mutation venant d'une autre origine est refusée.

## Contexte à lire
`docs/conventions/security.md` §6, `docs/conventions/api.md` (§ Sécurité), `data-model.md` (section Better Auth), `packages/db/src/schema/auth.ts`, `apps/api/src/server.ts`.

## À faire
- Better Auth dans `apps/api`, monté sous `/v1/auth/*` (`basePath`), adaptateur Drizzle sur les tables de `schema/auth.ts` : comparer à la sortie de sa CLI et migrer (nouvelle migration) si elle diffère. Email + mot de passe pour `owner`/`operator` (passkeys plus tard), cookies `HttpOnly Secure SameSite=Lax`, sessions en base.
- `requireRole(...roles)` (hook Fastify) et l'utilisateur courant (`id`, `role`, `creatorIds`) dans la requête ; `audit_log` sur login et changement de rôle.
- CSRF : vérification de l'en-tête `Origin` sur toute mutation (`POST`, `PUT`, `PATCH`, `DELETE`) contre la liste des origines autorisées, sans jeton séparé ; rate limit plus strict sur `/v1/auth/*`.
- Commande de création du premier `owner` (pas d'inscription ouverte).
- `apps/web` : page de connexion et garde de route (le design system D-01 existe ; écran minimal).

## Critères d'acceptation
- Test : requête sans cookie → 401 ; `operator` sur une route `owner` → 403 ; mutation avec `Origin` absent ou étranger → 403.
- Test : login puis `GET /v1/me` renvoie le rôle ; logout invalide la session.
- Aucune route d'inscription publique.

## Hors périmètre
Passkeys, rôle `creator` et PWA (phase 5), e2e de phase 0 (P0-07b).

## Notes de session
