# P0-07a Authentification du dashboard, rôles, CSRF, page de connexion

Statut : done
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

## Résultat (2026-10-17)

Fait : `apps/api/src/auth.ts` (Better Auth 1.7.7 sous `/v1/auth/*` avec l'adaptateur Drizzle sur les tables de `schema/auth.ts`, email + mot de passe de 12 caractères minimum, inscription publique coupée, sessions de 12 h en base, cookies `HttpOnly` `SameSite=Lax` et `Secure` en production, identifiants UUID v7, télémétrie coupée, jeton de session retiré des corps JSON (il ne vit que dans le cookie), `audit_log` à chaque connexion) ; `requireRole(...)` exposé par le composition root (401 `session_unauthenticated`, 403 `role_forbidden`) ; `GET /v1/me` (contrat `CurrentUserSchema`) ; vérification de l'en-tête `Origin` sur toute mutation dans `server.ts` (absente ou étrangère → 403 `origin_forbidden`) ; limite de 20 requêtes par minute et par IP sur `/v1/auth/*` ; `pnpm owner:create --email … --name …` (mot de passe tapé au terminal, `audit_log` du rôle) ; `AUTH_SECRET` refusé en production s'il vaut encore l'exemple ; `apps/web` : page de connexion, garde (rien ne s'affiche sans session), déconnexion, proxy `/v1` de Vite pour garder le cookie en première partie ; `/v1/demo/echo` réservé à `owner` et `operator`.

Tests : 8 d'intégration (401 sans session, jeton absent du corps de connexion, connexion puis `/v1/me` avec le rôle, ligne `auth.login` dans `audit_log`, cookie `HttpOnly` et `SameSite=Lax`, mauvais mot de passe refusé, `operator` → 403 sur une route `owner` et `owner` → 200, mutation d'une autre origine → 403 même connecté, aucune inscription publique, déconnexion qui invalide la session, doublon d'email et mot de passe court refusés), 2 unitaires de plus côté serveur (Origin, secret d'exemple), 3 côté web (session et messages de connexion), 2 de contrat.

Écarts : les tables Better Auth sont lues avec le rôle applicatif et non `withAdmin` : elles sont hors RLS et ce rôle suffit (moins de privilèges) ; `data-model.md` corrigé. La comparaison avec la CLI de Better Auth est faite par l'usage (connexion, session, compte, déconnexion passent sur nos tables) plutôt que par la CLI, qui demande de charger la configuration hors de l'application ; aucune migration n'a été nécessaire. Le mot de passe de `owner:create` s'affiche pendant la saisie (lecture de ligne simple) ; à masquer si le script sert ailleurs qu'en local.
