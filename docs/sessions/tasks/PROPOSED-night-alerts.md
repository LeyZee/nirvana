# Alertes par Telegram : bots, groupes, routage (ID à attribuer)
Statut : proposed (décisions de Charles le 17/10 à 21h44 et 21h49 ; ADR 0020 proposed ; module serveur d'abord, écran ensuite, « moins d'écrans, plus de moteur »)
Phase : 3
Dépend de : P0-05, P0-07b, P3-03 (chiffrement des secrets du CRM, ré-auth #41), changements de contrat de Bilan (ADR 0020)
Branche : task/<id>-night-alerts

## Objectif
Quand l'agent a besoin d'un humain, la nuit comme le jour, l'alerte part tout de suite dans un groupe Telegram, au lieu de dormir dans le CRM. Charles crée et gère les bots depuis Réglages › Alertes aussi simplement qu'une clé IA.

## Contexte à lire
ADR 0016 et 0020, `docs/architecture/data-model.md` (`domain_events`, `enqueue_job`), `packages/contracts/src/events.ts`, `apps/api/src/modules/conversations/application/journal.ts` (événements publiés), `apps/api/src/modules/providers` (modèle à suivre : chiffrement, routes owner, textes d'erreur uniques, vérificateurs), `apps/api/src/crontab.ts`, `apps/web/src/settings/services` (feuille de connexion à imiter), `docs/runbooks/incident.md`, maquette Réglages › Alertes (lien dans l'entrée de journal).

## Modèle de données (migration du module, add-only, relue par Bilan)
Tables hors RLS, retirées à `nirvana_app`, accès `withAdmin` dans le module, comme `provider_credentials`.

```
alert_bots        id uuid v7, telegram_bot_id text unique, username, display_name,
                  token_ciphertext bytea, key_version, state (active | refused | conflict | paused),
                  updates_offset bigint, last_polled_at, last_poll_error, created_at, updated_at
alert_chats       id, bot_id → alert_bots (cascade), telegram_chat_id text, title, kind (group | supergroup | channel),
                  membership (member | administrator | left | kicked), can_post bool,
                  next_send_at, last_sent_at, last_error_kind, last_error_at, discovered_at, updated_at
                  unique (bot_id, telegram_chat_id)
alert_routes      id, creator_id → creators nullable (null = toutes), level (urgent | important | info),
                  chat_id → alert_chats (cascade), created_at
                  unique (creator_id, level, chat_id) nulls not distinct
alert_deliveries  id, source_event_id (domain_events.id, ou clé synthétique pour le bilan et les tests), chat_id, creator_id,
                  level, kind, text, status (pending | sending | sent | failed | unknown | superseded),
                  attempts, telegram_message_id, error_kind, created_at, sent_at
                  unique (source_event_id, chat_id) ; index (chat_id, status)
alert_scan_cursor une ligne : last_created_at, last_event_id
```

Déclencheur `AFTER INSERT ON domain_events` → `enqueue_job('alerts.scan', '{}', 'alerts', now(), 25, 'alerts.scan')`.

## Événements consommés (table de classement du domaine)
| Événement | Condition | Niveau | Texte (exemple, fictif) |
|---|---|---|---|
| `handoff_requested` | `cause` ∈ minor, non_consent, distress, meeting, manipulation | urgent | « Possible mineur sur une photo. L'agent n'écrit plus à ce fan. » |
| `handoff_requested` | autre cause | important | « L'agent passe la main : une réponse a été bloquée par une garde. » |
| `budget_threshold_crossed` | `alert` / `reached` | important | « Plafond IA : 16 € sur 20 €. » / « Plafond atteint : plus de génération jusqu'à minuit. » |
| `session_state_changed` | `to = expired` | important | « La session Reveal a expiré : l'agent ne lit plus rien. » |
| `session_state_changed` | retour à `valid` | info, en réponse à l'alerte | « Résolu : session de retour. » |
| `kill_switch_toggled` | `active = true` | important | « Agent arrêté (global) : <raison>. » |
| `kill_switch_toggled` | `active = false` | info, en réponse | « Résolu : agent relancé. » |
| `takeover_started` | une alerte existe pour la conversation | modification du message | « ✓ Pris en main par <prénom> » |
| cron `alerts.morning_digest` | 8 h dans le fuseau de la créatrice | info | relais de la nuit, ventes, dépense IA |

Un événement absent de la table ne produit rien. La raison libre d'un `kill_switch_toggled` est écrite par un humain du CRM. Elle est échappée et coupée à 200 caractères.

## Contrat API (`packages/contracts/src/alerts.ts`, add-only, relu par Bilan)
Toutes les routes : `requireRole('owner')`. Les écritures sur un bot passent par la ré-auth de 10 minutes (#41).

```
GET    /v1/settings/alerts                → { bots: AlertBot[], routes: AlertRoute[], coverage: Coverage, version }
POST   /v1/settings/alerts/bots           { token }   → 201 AlertBot     (getMe + deleteWebhook avant d'enregistrer)
PUT    /v1/settings/alerts/bots/:id/token { token }   → AlertBot         (même telegram_bot_id, sinon alert_bot_mismatch)
POST   /v1/settings/alerts/bots/:id/listen            → 202              (enfile poll_updates long, pour l'étape « ajoute-le au groupe »)
DELETE /v1/settings/alerts/bots/:id                   → 204              (routes et groupes du bot supprimés)
POST   /v1/settings/alerts/chats/:id/test             → { sentAt } | erreur
PUT    /v1/settings/alerts/routes         { version, routes: [{ creatorId|null, level, chatId }] } → { routes, version }
GET    /v1/settings/alerts/deliveries?limit=50        → journal des 30 derniers jours, sans texte de fan (il n'y en a pas)
```

Pour le Dashboard (carte Gardes de la maquette v6, « Alertes Telegram cette nuit : N ») : le module exporte par son `index.ts` une requête `nightCounts(creatorId, night)` → `{ urgent, important, info }`, la nuit allant de 20 h à 8 h dans le fuseau de la créatrice. La future route `GET /v1/dashboard` la lit ; aucune route propre n'est ajoutée.

`AlertBot` : id, username, displayName, state, lastPolledAt, chats[] (id, title, kind, membership, canPost, lastSentAt, lastError). Jamais de jeton.
`Coverage` : par créatrice active, `urgentReachable` (booléen) et les niveaux sans groupe.
Erreurs (une seule table de textes dans `domain/messages.ts`, comme `providers`) : `alert_token_shape`, `alert_token_refused`, `alert_bot_exists`, `alert_bot_mismatch`, `alert_bot_conflict`, `alert_chat_unreachable`, `telegram_unreachable`, `alert_routes_version_conflict`, `reauth_required`.

## Parcours de création (écran, après le module)
1. **Crée le bot.** Bouton « Ouvrir @BotFather » (`https://t.me/BotFather`), puis : envoie `/newbot`, donne un nom (puce à copier « Nirvana Alertes »), un identifiant qui finit par `bot` (puce « nirvana_alertes_bot »). @BotFather répond avec un jeton.
2. **Colle le jeton.** Vérification automatique au collage. Le bot apparaît avec son nom et son identifiant, ou un texte qui dit quoi corriger.
3. **Ajoute-le au groupe.** Bouton « Ouvrir dans Telegram » (`https://t.me/<bot>?startgroup=nirvana`). L'écran écoute et affiche le groupe dès que le bot y entre, sans rien saisir.
4. **Choisis qui reçoit quoi.** Trois interrupteurs (Urgent, Important, Info), pour toutes les créatrices par défaut, puis « Envoyer un test ».

## À faire, lot 1 : moteur
- [ ] Module `apps/api/src/modules/alerts` (domain, application, infra, index) et son README. Le domaine contient la table de classement, le rendu des textes, le regroupement et le calcul de la couverture, sans aucune I/O.
- [ ] Port `AlertChannel` : `verify(token)`, `poll(offset)`, `send`, `edit`, `reply`. Adaptateur Telegram en `fetch`, réponses validées par Zod, jamais d'URL ni d'erreur brute dans un journal. Faux canal pour les tests.
- [ ] Migration et schéma Drizzle du module, plus le déclencheur sur `domain_events`.
- [ ] Jobs : `alerts.scan`, `alerts.flush_chat` (file `alert-chat:<id>`), `alerts.poll_updates` (file `alert-bot:<id>`, cron 1 min), `alerts.morning_digest` (cron horaire), `alerts.purge` (cron quotidien).
- [ ] Routes ci-dessus. Lignes du composition root et du worker demandées à Bilan par le coordinateur.
- [ ] Test qui prouve que pendant l'attente d'un humain la conversation reste `handoff_requested` et que l'agent ne génère ni n'envoie plus rien au fan jusqu'à la reprise.
- [ ] Glossaire : « Alerte », « Niveau d'alerte », « Bot d'alertes », « Groupe d'alertes », « Astreinte ». Runbook des alertes (nouveau fichier dans `docs/runbooks/`) : que faire à chaque niveau, révoquer un jeton.

## À faire, lot 2 : écran
- [ ] `apps/web/src/settings/alerts/` (dossier propre, le fil Extension relit). Lignes de router et de navigation passées par le coordinateur.
- [ ] Feuille de création en quatre étapes, liste des bots et de leurs groupes, grille de routage, test, santé, confirmation de suppression dans la page (`nv-confirm`).
- [ ] Bandeau de couverture sur Réglages et sur le Dashboard (« Personne n'est prévenu la nuit »).

## Critères d'acceptation
- Unitaires : classement de chaque type d'événement, rendu échappé (aucun texte de fan possible : le type d'entrée n'en a pas), regroupement sans mélanger les niveaux, calcul de couverture.
- Intégration (Testcontainers, faux canal) :
  - un événement urgent inséré dans `domain_events` arrive sur le faux canal en moins de 5 secondes ;
  - rejouer le scan deux fois ne poste qu'une fois, et le curseur avance ;
  - un 429 décale l'envoi de `retry_after` ;
  - un 403 marque le groupe retiré ;
  - un `migrate_to_chat_id` met à jour le groupe et renvoie ;
  - un 401 passe le bot « à reconnecter » ;
  - une livraison urgente restée `sending` est renvoyée, une livraison info ne l'est pas ;
  - aucune route ne renvoie un jeton ; une ligne `alert_bots` lue en base ne contient pas le jeton en clair.
- Routes : 403 pour un `operator`, `reauth_required` au-delà de 10 minutes, 409 sur une version de routage périmée.
- `pnpm check`, `pnpm test:all` verts. Aucun jeton dans le dépôt, aucune donnée réelle.

## Hors périmètre
Les commandes depuis Telegram (le bot ne pilote rien), le planning d'astreinte (le groupe est fixe), le mail de secours (second adaptateur, plus tard), les notifications push de la PWA, l'écran Suivi.

## Notes de session
- 17/10, fil Alertes Telegram : fiche de Bilan (#47) étendue. Le jeton quitte `providers` pour `alert_bots` (plusieurs bots) : ADR 0020. Maquette de l'écran publiée (lien dans le journal).
