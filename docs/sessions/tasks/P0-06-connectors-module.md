# P0-06 Module `connectors` : port, `FakeConnector`, test de contrat, poller

Statut : done
Phase : 0
Dépend de : P0-05
Branche : task/p0-06-connectors-module

## Objectif
Le port `PlatformConnector` est codé, un `FakeConnector` à scénarios l'implémente, une suite de contrat le vérifie, et un poller alimente `conversations.ingestMessage` depuis n'importe quel connecteur, avec gestion de la session et du coupe-circuit.

## Contexte à lire
`modules/connectors/README.md`, `docs/architecture/connectors.md`, `docs/architecture/modules.md` (inversion `OutboundSender`), ADR 0006 (files série), 0008, `security.md` §2 (sessions chiffrées), `docs/conventions/api.md`.

## À faire
- `domain/platform-connector.ts` : l'interface, `ConnectorError` typées, `ConnectorCapabilities`.
- `infra/fake/FakeConnector.ts` : en mémoire, scénarios (`enqueueInbound`, `failNext('sendText', 'RateLimited')`, `expireSession()`), horloge injectée.
- `__tests__/contract.test.ts` : suite paramétrée par une fabrique de connecteur ; cas : liste, fetch incrémental, envoi idempotent (deux appels même clé = un envoi), `verifySent`, erreurs typées, session expirée.
- `application/dispatch.ts` : job `connector.dispatch` (le seul job du crontab, chaque minute) qui enfile un `connector.poll` par compte actif avec `queueName = account:<id>`, `jobKey = poll:<id>` et un `runAt` calculé depuis l'intervalle et le jitter de `connector_config`.
- `application/poll.ts` : job `connector.poll` : `listConversations(since)` → `fetchMessages` → `ingestMessage` ; curseur `last_poll_at` ; coupe-circuit (N erreurs → pause + événement `session_state_changed`/`error`) ; `health()` périodique.
- `application/reconcile.ts` : job `connector.reconcile` (10 min) tel que décrit dans `message-flow.md` §7.
- `application/sessions.ts` : `storeSession(platformAccountId, payload)` chiffré, `loadSession`, `markExpired` ; route `POST /v1/connector/sessions` protégée par jeton d'appareil (comparaison en temps constant), audit.
- Implémentation de `OutboundSender` (port défini dans `conversations/domain/ports.ts`) : `sendText`, `sendMedia`, `verifySent` qui résolvent le connecteur du compte ; branchée dans le composition root, jamais importée par `conversations`.
- Un seul poll par compte à la fois : garanti par la file série `account:<id>` de Graphile Worker (pas de verrou advisory).

## Critères d'acceptation
- Suite de contrat verte sur `FakeConnector`.
- Test d'intégration : scénario Fake avec 3 messages → 3 `messages`, 1 job `respond` ; 429 sur `sendText` → retry puis succès, un seul envoi ; session expirée → état `expired`, poll arrêté, événement émis, aucun appel LLM.
- Test : deux `connector.poll` enfilés pour le même compte s'exécutent l'un après l'autre, jamais en parallèle (file série) ; un `dispatch` qui retrouve un poll déjà en file ne le duplique pas (`jobKey`).
- Test : la session stockée est illisible en base sans la clé ; les logs ne contiennent jamais le payload.

## Hors périmètre
Reveal réel, extension.

## Notes de session

## Résultat (2026-10-17)

Fait :
- `domain/` : port `PlatformConnector` et `ConnectorError` typée (`session_expired`, `rate_limited` avec `retryAfterSeconds`, `not_found`, `transient`, `fatal`) ; `rhythm.ts` (prochaine relève = intervalle + jitter, coupe-circuit) ; ports (`AccountStore`, `AccountJobs`, `SessionVault`, `ConnectorRegistry`, `IngestMessage`) ; erreurs du module.
- `infra/fake/FakeConnector.ts` : plateforme en mémoire à scénarios (`enqueueInbound`, `failNext(méthode, code)`, `expireSession`, `delayMs`, compteurs d'appels et d'appels simultanés), envoi idempotent par clé, horloge injectée.
- `infra/__tests__/contract.test.ts` : suite de contrat paramétrée par adaptateur (liste, fetch incrémental, envoi idempotent, `verifySent`, erreurs typées, session expirée). `RevealApiConnector` + FakeReveal s'y ajoutera en phase 1.
- `application/` : `dispatch` (un `connector.poll` par compte relevable sur `account:<id>`, `jobKey poll:<id>` en `preserve_run_at`, `connector.reconcile` toutes les 10 min), `poll` (`health`, conversations bougées depuis `last_poll_at` moins 60 s, messages, `ingestMessage`, curseur ; première relève : 24 h en arrière), `reconcile` (conversations actives des dernières 24 h, 20 derniers messages), `sessions` (`store`, `load`, `markExpired`), `OutboundSender` (résout le compte et son connecteur, `ConnectorError` → `connector_<code>`, session expirée → compte arrêté), résolveur (un client par compte, reconstruit à chaque nouvelle session).
- Route `POST /v1/connector/sessions` : jeton d'appareil `x-extension-token` comparé en temps constant, exemptée de la vérification d'Origin (option de route `originCheck: false`), session chiffrée AES-256-GCM liée à l'id du compte, état `valid`, coupe-circuit refermé, événement `session_state_changed`, ligne `audit_log` sans la session.
- Migration `0003_connector_breaker` : `platform_accounts.consecutive_errors` et `paused_until`. Contrats : `ConnectorConfigSchema` (défauts 60 s, jitter 20 s, seuil 5, pause 10 min) et `ConnectorSessionBodySchema`.
- Config : `SESSION_ENCRYPTION_KEYS` et `EXTENSION_DEVICE_TOKEN`, optionnelles en développement (valeur d'exemple = absente), obligatoires en production. Composition root : `NO_SENDER` et le `connector.dispatch` vide remplacés ; tâches `connector.poll` et `connector.reconcile` ; `createApp(config, logger, { connectorRegistry })` pour brancher un faux connecteur.

Tests : 4 unitaires (rythme, coupe-circuit), 6 de contrat, 7 d'intégration : 3 messages → 3 `messages` et 1 `respond`, seconde relève sans doublon ; 429 sur `sendText` → nouvel essai puis succès, chaque bulle envoyée une fois, nos propres messages relus sans doublon ; session expirée → `expired`, événement, rien d'ingéré, aucun `respond`, plus d'appel ; coupe-circuit à 5 échecs, événement `error`, compte laissé tranquille ; `dispatch` deux fois → un seul poll en file sur `account:<id>`, comptes expirés et en pause exclus ; deux polls du même compte sous un worker de concurrence 5 → jamais simultanés ; session stockée illisible sans la clé, lisible avec, jamais dans les logs (ni le jeton).

Reste :
- Le volet « envois non retrouvés → `send_failed` après 5 min » de `connector.reconcile` (message-flow.md §7) n'est pas fait : le job `conversation.send` vérifie déjà chaque issue inconnue et passe en `error` au troisième essai ; le filet pour un worker mort en plein envoi demande une commande de `conversations`, à faire avec le kill switch (P2).
- Aucun adaptateur réel : le registre est vide en production jusqu'à `RevealApiConnector` (phase 1), donc aucun compte n'est relevé.

Écarts : la suite de contrat vit dans `infra/__tests__/` (un test hors couche n'est pas couvert par les règles de frontières) ; première relève limitée à 24 h pour ne pas répondre à tout un historique ; `reconcile` ne nourrit pas le coupe-circuit sauf session expirée.

