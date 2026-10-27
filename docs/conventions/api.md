# Conventions d'API HTTP et d'événements

Dernière revue : 2026-10-16. S'applique à `apps/api` (routes Fastify) et à ses clients (`apps/web`, `apps/extension`). Les schémas des requêtes et réponses vivent dans `packages/contracts` et sont la seule source de vérité : une route ne déclare jamais un schéma local.

## Forme générale

- Préfixe **`/v1`** dès le premier jour (`/v1/conversations`). On ne casse pas `/v1` ; une rupture crée `/v2`.
- Ressources au pluriel, en kebab-case : `/v1/conversations/{id}/drafts/{draftId}`. Actions non-CRUD en sous-ressource verbe : `POST /v1/conversations/{id}/takeover`, `/release`, `/mode`.
- Identifiants : UUID v7 en chaîne. Dates : ISO 8601 en UTC (`2026-10-16T18:00:00Z`). Argent : `{ "amountMinor": 1500, "currency": "EUR" }`. Jamais de `snake_case` dans le JSON exposé : **camelCase** partout (la base est en snake_case, Drizzle fait la conversion).
- Lecture : `GET`. Création : `POST` → `201` + objet. Modification partielle : `PATCH`. Suppression logique : `DELETE` → `204`.
- Une route qui lit ou modifie les données d'une créatrice prend `creatorId` en paramètre de requête : un `owner` les voit toutes, les autres rôles seulement celles de leur `creatorIds` (sinon 403 `creator_forbidden`). Les conversations et les fans ne s’ouvrent jamais au rôle `creator`, même pour les siennes (403 `role_forbidden`, ADR 0023).
- Hors `/v1` : seulement `/health` et `/ready`. Tout le reste est sous `/v1`, y compris `/v1/events` (SSE), `/v1/connector/sessions` (extension, jeton d'appareil) et `/v1/auth/*` (Better Auth, `basePath` configuré).

## Pagination

Toujours par curseur, jamais par offset : `GET /v1/conversations/{id}/messages?creatorId=…&limit=50&cursor=…` → `{ "items": [...], "nextCursor": "…" | null }`. `limit` borné (défaut 50, max 200). Le curseur est opaque (base64 de `(created_at, id)`).

## Erreurs

Un seul format, produit par le gestionnaire central :

```json
{ "error": { "code": "conversation_not_found", "message": "Conversation introuvable", "details": {}, "requestId": "…" } }
```

- `DomainError.code` → `code` (snake_case stable, documenté dans `packages/contracts/src/errors.ts`) ; mappage HTTP : `*_not_found` → 404, `*_invalid`/validation Zod → 400 (`details` contient les erreurs de champ), `*_unauthenticated` → 401 (pas de session), `*_forbidden` → 403 (rôle ou origine refusés), `*_conflict`/transition d'état interdite → 409, `*_unprocessable` (contenu refusé par une règle métier, une garde par exemple) → 422, limite → 429, `service_unavailable` → 503 (un limiteur qui échoue fermé n’a pas pu compter), le reste → 500 **sans** détail interne.
- `message` est en français, destiné à l'opérateur, jamais une stack ni une requête SQL.
- Chaque groupe de routes publie ses codes dans les contrats, à côté de ses schémas : par exemple `INVITATION_LINK_ERROR_CODES` (liens d'invitation) et `BACKUP_ERROR_CODES` (`POST /v1/backups/restore-tests` : `restore_test_backup_unprocessable`, `restore_test_before_backup_unprocessable`, `restore_test_in_future_unprocessable`, `restore_test_conflict`).

## Idempotence et corrélation

- Tout `POST` qui provoque un effet externe (approuver un draft, envoyer, capturer une session) accepte l'en-tête `Idempotency-Key` ; même clé → même réponse, pas de second effet (stockage 24 h).
- Chaque requête reçoit ou génère `x-request-id`, renvoyé dans la réponse et dans `error.requestId`. Il devient le `correlation_id` des événements et des jobs qu'elle déclenche. Les logs portent toujours `requestId`, et quand ils existent `creatorId`, `conversationId`, `draftId`, `jobId`.

## Temps réel (SSE)

`GET /v1/events` (authentifié) émet les événements de `conversation_events` autorisés pour l'utilisateur, avec le **même nom de type** que dans la table (`draft_created`, `message_received`, …) et un payload réduit (identifiants, pas de contenu de message). Reconnexion avec `Last-Event-ID`. Le client relit la ressource concernée via l'API ; le flux SSE ne remplace pas une lecture.

## Sécurité

Cookies de session `HttpOnly Secure SameSite=Lax` ; en-tête `Origin` vérifié sur toute requête non `GET` contre la liste des origines autorisées ; CORS limité à `WEB_ORIGIN` ; rate limit par utilisateur et par IP (en-têtes `RateLimit-*`). Détail : `security.md` §6.

## Ce qu'on ne fait pas

GraphQL, versionnage par en-tête, pagination par offset, réponses enveloppées différemment d'une route à l'autre, champs calculés côté client qui existent côté serveur.
