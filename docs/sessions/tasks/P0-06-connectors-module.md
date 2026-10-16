# P0-06 Module `connectors` : port, `FakeConnector`, test de contrat, poller

Statut : todo
Phase : 0
Dépend de : P0-05
Branche : task/p0-06-connectors-module

## Objectif
Le port `PlatformConnector` est codé, un `FakeConnector` à scénarios l'implémente, une suite de contrat le vérifie, et un poller alimente `conversations.ingestMessage` depuis n'importe quel connecteur, avec gestion de la session et du coupe-circuit.

## Contexte à lire
`modules/connectors/README.md`, `docs/architecture/connectors.md`, ADR 0008, `security.md` §2 (sessions chiffrées).

## À faire
- `domain/platform-connector.ts` : l'interface, `ConnectorError` typées, `ConnectorCapabilities`.
- `infra/fake/FakeConnector.ts` : en mémoire, scénarios (`enqueueInbound`, `failNext('sendText', 'RateLimited')`, `expireSession()`), horloge injectée.
- `__tests__/contract.test.ts` : suite paramétrée par une fabrique de connecteur ; cas : liste, fetch incrémental, envoi idempotent (deux appels même clé = un envoi), `verifySent`, erreurs typées, session expirée.
- `application/poll.ts` : job `connector.poll` par `platform_account` (crontab, intervalle avec jitter depuis `connector_config`), `listConversations(since)` → `fetchMessages` → `ingestMessage` ; curseur `last_poll_at` ; coupe-circuit (N erreurs → pause + événement `session_state_changed`/`error`) ; `health()` périodique.
- `application/reconcile.ts` : job `connector.reconcile` (10 min) tel que décrit dans `message-flow.md` §7.
- `application/sessions.ts` : `storeSession(platformAccountId, payload)` chiffré, `loadSession`, `markExpired` ; route `POST /connector/sessions` protégée par jeton d'appareil (comparaison en temps constant), audit.
- Port d'envoi exposé à `conversations` via `index.ts` : `sendText`, `sendMedia`, `verifySent` qui résolvent le connecteur du compte.
- Un seul client par compte : verrou advisory Postgres par `platform_account_id` autour du poll.

## Critères d'acceptation
- Suite de contrat verte sur `FakeConnector`.
- Test d'intégration : scénario Fake avec 3 messages → 3 `messages`, 1 job `respond` ; 429 sur `sendText` → retry puis succès, un seul envoi ; session expirée → état `expired`, poll arrêté, événement émis, aucun appel LLM.
- Test : deux pollers simultanés sur le même compte → un seul s'exécute.
- Test : la session stockée est illisible en base sans la clé ; les logs ne contiennent jamais le payload.

## Hors périmètre
Reveal réel, extension.

## Notes de session
