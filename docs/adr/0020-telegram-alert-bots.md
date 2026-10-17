# 0020. Alertes par des bots Telegram gérés depuis le CRM

Statut : proposed
Date : 2026-10-17

## Contexte

La nuit, l'agent tourne seul. Quand il s'arrête pour un fan (mineur possible, non-consentement, détresse, demande de rencontre, manipulation), quand la session Reveal expire, quand le plafond du jour approche ou qu'un interrupteur d'arrêt est tiré, personne ne regarde le CRM. Charles a choisi Telegram le 17/10 à 21h44 : son équipe y vit déjà, c'est du push mobile gratuit et il n'y a pas d'écran d'alerte à construire. À 21h49, il a demandé que les bots se créent et se gèrent comme les clés des services IA (ADR 0016) : une marche à suivre guidée, plusieurs bots, les groupes où chacun se trouve, un système robuste et facile à tenir. La fiche `PROPOSED-night-alerts.md` décrit le travail.

Faits Telegram qui contraignent le choix :

- Un bot ne se crée pas par API. Seul @BotFather le crée (`/newbot`) et donne un jeton.
- Un jeton est lu soit par `getUpdates` (le serveur interroge Telegram), soit par un webhook (Telegram appelle le serveur), jamais les deux. Deux lecteurs `getUpdates` simultanés sur le même jeton se coupent l'un l'autre (409).
- Un bot apprend qu'on l'a ajouté à un groupe, ou retiré, par une mise à jour `my_chat_member`. Un groupe qui devient supergroupe change d'identifiant (`migrate_to_chat_id`).
- Limites d'envoi : environ 20 messages par minute dans un même groupe, 30 par seconde pour un bot. Au-delà, Telegram répond 429 avec `retry_after`.
- Telegram est un tiers. Il n'offre pas de clé d'idempotence : un envoi rejoué après une coupure peut arriver deux fois.

## Décision

1. **Module `alerts`**, distinct de `supervision`. `supervision` garde les notifications dans le CRM (table `notifications`, SSE, Web Push). `alerts` transforme des événements en alertes et les livre sur des canaux externes. Telegram est son premier adaptateur, derrière un port `AlertChannel`. Le mail de secours sera un second adaptateur.

2. **Trois niveaux, classés en code** (règle 3 de `CLAUDE.md`). Le classement est une table du domaine, testée, jamais un prompt.
   - **urgent** : un relais humain pour mineur possible, non-consentement, détresse, demande de rencontre ou manipulation. Message sonore.
   - **important** : plafond du jour à 80 % ou atteint, session plateforme expirée, interrupteur d'arrêt activé, autre relais humain. Message sonore.
   - **info** : bilan du matin, retour à la normale. Message silencieux (`disable_notification`).

3. **Plusieurs bots, des groupes découverts, un routage.** Quatre tables, réglages de l'agence hors RLS (comme `provider_credentials`), retirées au rôle `nirvana_app`, lues et écrites par `withAdmin` dans le module :
   - `alert_bots` : un bot, son jeton scellé, son identité Telegram, son état, son curseur `getUpdates`.
   - `alert_chats` : un groupe où un bot se trouve, découvert, jamais saisi à la main.
   - `alert_routes` : quel niveau va dans quel groupe, pour une créatrice ou pour toutes.
   - `alert_deliveries` : une alerte à livrer dans un groupe, unique par (événement, groupe).

4. **Le jeton est un secret de l'agence.** Il est scellé en AES-256-GCM avec `CREDENTIALS_ENCRYPTION_KEYS` (contexte `alert_bot:<id>`), comme les clés IA, et vérifié par `getMe` avant d'être gardé. Aucune route ne le renvoie. Ajouter, remplacer ou supprimer un bot est réservé au propriétaire, avec la redemande du mot de passe après 10 minutes (ADR 0016, #41). Le jeton fait partie de l'URL de l'API Telegram (`/bot<jeton>/…`). Le client HTTP du module ne journalise donc jamais une URL ni une erreur brute : il les traduit d'abord en un type d'erreur. Ni l'extension ni `.env` ne portent de jeton en production.

5. **Le worker interroge Telegram (`getUpdates`), pas de webhook.** Derrière Coolify, il n'y a ni URL publique à exposer ni secret de webhook à tenir. À la connexion d'un bot, le module appelle `deleteWebhook`. Le job `alerts.poll_updates` tourne dans la file série `alert-bot:<id>` : un seul lecteur par jeton, jamais de 409 entre nos propres jobs. Il tourne chaque minute, et à la demande pendant que l'écran attend un groupe, en appel long de 20 secondes. Un 409 venu d'ailleurs veut dire que le jeton sert à un autre programme : le bot passe « utilisé ailleurs » et l'écran le dit.

6. **Les alertes naissent de l'outbox `domain_events`, sans en manquer.** Un déclencheur `AFTER INSERT` sur `domain_events` enfile `alerts.scan` avec une clé de job unique, par `enqueue_job` (migration du module). L'alerte part dès le commit, une rafale ne produit qu'un scan, et un événement annulé n'enfile rien. Le scan relit une fenêtre de deux minutes derrière son curseur, parce que des transactions concurrentes peuvent se valider dans le désordre. La contrainte unique (événement, groupe) rend ce recouvrement sans effet. Un cron d'une minute rattrape un déclencheur manqué.

7. **Livraison par groupe, à la cadence de Telegram.** `alerts.flush_chat` tourne dans la file série `alert-chat:<id>`. Il prend toutes les livraisons en attente du groupe, les plus graves d'abord. Si plusieurs attendent, il les regroupe en un seul message, sans jamais mélanger un urgent dans un message silencieux. Il garde trois secondes entre deux messages d'un même groupe et suit `retry_after` sur un 429. En cas d'erreur réseau ou de 5xx, il réessaie avec un délai croissant pendant une heure. Sur un 403 (bot retiré du groupe), le groupe passe « retiré » et ses routes « cassées ». Sur un 401 (jeton révoqué), le bot passe « à reconnecter ». Sur un `migrate_to_chat_id`, il met à jour l'identifiant et renvoie.

8. **Rejeu : au moins une fois pour l'urgent, au plus une fois pour le reste.** Une livraison passe `sending` avant l'appel. Si le worker meurt avant de la marquer `sent`, l'urgent est renvoyé, avec la mention « (renvoi) » ; un doublon vaut mieux qu'un silence. L'important et l'info passent alors `unknown`, sans renvoi.

9. **Aucune donnée de fan chez Telegram.** Une alerte contient le niveau, la créatrice, la raison en français écrite par le code, ce que l'agent a fait (« il n'écrit plus à ce fan ») et un lien vers la conversation dans le CRM. Elle ne contient ni le texte du fan, ni son pseudo, ni un média (ADR 0010). Le texte est envoyé en HTML échappé, sans aperçu de lien.

10. **Le fil d'une alerte se ferme dans Telegram.** Quand un humain prend la conversation (`takeover_started`), le message d'origine est modifié (`editMessageText`) : « ✓ Pris en main par <prénom> ». Quand la session revient ou que l'interrupteur est relâché, une réponse silencieuse au message d'origine dit « Résolu ». Le groupe voit ce qui reste à faire sans ouvrir le CRM.

11. **Personne ne doit croire être prévenu à tort.** L'API calcule une couverture : pour chaque créatrice active, au moins un groupe joignable reçoit l'urgent. Sans couverture, Réglages et le Dashboard le disent (« Personne n'est prévenu la nuit »). Une alerte urgente qu'aucun groupe ne peut recevoir devient une ligne d'erreur et une notification dans le CRM (`supervision`).

12. **Le bot ne pilote rien.** Aucune commande Telegram n'agit sur l'agent. Le bot lit seulement les mises à jour d'appartenance aux groupes.

## Changements de contrat demandés à Bilan

Le module en dépend ; Bilan les écrit dans `packages/contracts` et dans les modules qu'il possède :

- `handoff_requested` : ajouter `conversationId` et une `cause` fermée (`minor`, `non_consent`, `distress`, `meeting`, `manipulation`, `guard`, `budget`, `other`). Aujourd'hui `reason` est un texte libre, et le classement ne doit pas lire un texte.
- Un événement `budget_threshold_crossed` (`kind: alert | reached`, dépense et plafond en centimes), publié dans `domain_events` par `onBudget` (`apps/api/src/llm.ts`, le TODO P3-06 y est déjà).
- `takeover_started` dans les événements publiés à l'outbox (`journal.ts`).
- `alerts` dans le composition root et ses jobs dans le contrat `jobs.ts`.

## Conséquences

- On gère tout depuis Réglages › Alertes : créer un bot en quatre étapes guidées, voir ses groupes, choisir qui reçoit quoi, envoyer un test, lire la santé de chaque bot (dernière lecture, dernier envoi, échecs).
- Telegram sait qu'une alerte a eu lieu, pour quelle créatrice et à quelle heure. Il ne sait rien du fan. C'est le prix d'un push mobile gratuit, accepté par Charles.
- Une fuite de la base seule ne livre pas les jetons. Une fuite de la base et de l'environnement, oui : rotation par `docs/runbooks/rotate-secrets.md`, plus une révocation dans @BotFather (`/revoke`).
- `alert_deliveries` est purgée après 30 jours (`alerts.purge`). Une alerte n'est pas une preuve, le journal des conversations l'est.
- À surveiller : si Nirvana sert plusieurs agences, les quatre tables prennent une colonne d'agence et une politique RLS, comme `provider_credentials`.

## Alternatives rejetées

- **Le jeton dans `provider_credentials`** (première idée de la fiche) : la table tient une ligne par fournisseur, et il faut plusieurs bots, chacun avec ses groupes et son curseur.
- **Webhook** : il faut une URL publique, un secret par bot et un routage Coolify en plus. Un serveur arrêté perd aussi les mises à jour au-delà de 24 heures, alors que `getUpdates` les rattrape au redémarrage.
- **Identifiant de groupe saisi à la main** : personne ne connaît le `chat_id` d'un groupe, et une faute de frappe envoie les alertes dans le vide. La découverte par `my_chat_member` ne laisse choisir qu'un groupe où le bot est vraiment.
- **Lire `domain_events` seulement par un cron d'une minute** : une alerte urgente pourrait attendre près d'une minute. Le déclencheur la fait partir au commit.
- **Web Push de la PWA seul** : il dépend d'un navigateur ouvert ou installé sur chaque téléphone, et l'équipe ne vit pas dans la PWA.
