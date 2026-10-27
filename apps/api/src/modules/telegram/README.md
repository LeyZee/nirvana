# Module `telegram`

**Rôle.** Prévenir l'équipe dans des groupes Telegram de ce qui demande son attention : les alertes (passage à l'humain, plafond IA, session expirée, arrêt de l'agent), puis les ventes, les mots-clés et les validations quand leurs événements existeront. Les bots se créent et se gèrent depuis Réglages › Telegram (ADR 0020, fiche P3-07).

**Peut dépendre de.** Aucun module. `packages/contracts` ; l'infra lit l'outbox `domain_events`, les créatrices (`creators`) et le nom des utilisateurs (`user`) en lecture seule, et parle à l'API Bot de Telegram.

**Tables possédées.** `telegram_bots`, `telegram_chats`, `telegram_routes`, `telegram_deliveries`, `telegram_state` (`packages/db/src/schema/telegram.ts`, migration 0006) : hors RLS, retirées au rôle applicatif, lues et écrites par `withAdmin`. Le jeton d'un bot est scellé par `CREDENTIALS_ENCRYPTION_KEYS` (contexte `telegram_bot:<id>`). La migration pose aussi le déclencheur `domain_events_telegram_scan`, qui enfile `telegram.scan` au commit d'un événement consommé et n'annule jamais l'écriture de l'outbox.

**Routes.** `/v1/settings/telegram` : `GET`, `POST /bots`, `PUT /bots/:id/token`, `POST /bots/:id/listen`, `DELETE /bots/:id`, `POST /chats/:id/test`, `PUT /routes`, `GET /deliveries`, derrière `requireRole('owner')` ; ajouter, remplacer ou supprimer un bot demande une connexion de moins de 10 minutes.

**Jobs.** `TELEGRAM_JOB_PAYLOADS` (contracts) ; le worker les branche sur `module.jobs` :

- `telegram.scan` (file `telegram`, clé unique) : outbox → livraisons ; aussi chaque minute en rattrapage.
- `telegram.flush_chat` (file `telegram-chat:<id>`, clé par groupe) : envoie, à 3 s d'écart au plus dans un groupe.
- `telegram.dispatch_polls` (chaque minute) puis `telegram.poll_updates` (file `telegram-bot:<id>`) : groupes découverts par `getUpdates`.
- `telegram.morning_digest` (chaque heure, n'agit qu'à 8 h dans le fuseau de la créatrice) et `telegram.purge` (chaque jour, 30 jours).

**Pour le Dashboard.** `nightCounts(creatorId)` → `{ urgent, important, info }` de la nuit (20 h → 8 h, fuseau de `creators.timezone`).

## Règles propres

- Aucune donnée de fan ne part chez Telegram : un message dit le sujet, la créatrice, une raison écrite par le code et un lien vers le CRM. Les entrées du domaine n'ont aucun champ pour un texte de fan.
- Le classement des événements est une table du domaine (`domain/classify.ts`), jamais un prompt. Causes urgentes : mineur, non-consentement, détresse, rencontre, manipulation ; les autres causes (dont `keyword`) sont importantes.
- Le client HTTP ne journalise jamais une URL ni une erreur brute : le jeton est dans l'URL.
- Un seul lecteur `getUpdates` par jeton (file série par bot). Un 409 venu d'ailleurs passe le bot « utilisé ailleurs ».
- Rejeu : l'urgent coupé en plein appel repart marqué « (renvoi) » ; le reste passe `unknown`, sans renvoi.
- Au démarrage, `start()` rescelle avec la clé la plus récente tout jeton scellé avec une ancienne (rotation, `docs/runbooks/rotate-secrets.md`).
- Le bot ne pilote rien : aucun bouton d'action, seulement des liens.

## Structure

- `domain/` : signaux, classement, rendu HTML échappé, regroupement, couverture, horaires, forme du jeton, textes d'erreur, ports. Pur, testé.
- `application/` : scan de l'outbox, livraison par groupe, lecture des bots, réglages (bots, routage, test, journal, bilan du matin, purge).
- `infra/` : client de l'API Bot (réponses validées par Zod), lecture tolérante de l'outbox, magasin Postgres, routes.
- `index.ts` : `startTelegramModule(options)` pour le composition root, `createTelegramModule(deps)` pour les tests.
