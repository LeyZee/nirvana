# P0-06 Module `connectors` : port, `FakeConnector`, test de contrat, poller

Statut : todo
Phase : 0
Dépend de : P0-05
Branche : task/p0-06-connectors-module

## Objectif
Le port `PlatformConnector` est codé, un `FakeConnector` à scénarios l'implémente, une suite de contrat le vérifie, et un poller alimente `conversations.ingestMessage` depuis n'importe quel connecteur, avec gestion de la session et du coupe-circuit.

## Contexte à lire
`modules/connectors/README.md`, `docs/architecture/connectors.md`, `docs/architecture/modules.md` (inversion `OutboundSender`), ADR 0004 (files série), 0008, `security.md` §2 (sessions chiffrées), `docs/conventions/api.md`.

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
