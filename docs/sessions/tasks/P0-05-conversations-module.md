# P0-05 Module `conversations` : ingestion, journal, projections

Statut : done
Phase : 0
Dépend de : P0-04
Branche : task/p0-05-conversations-module

## Objectif
Le module `conversations` ingère un message entrant de façon idempotente, écrit l'événement dans la même transaction, met à jour les projections et enfile `conversation.respond` avec debounce ; la machine d'état des conversations et des drafts est codée et testée.

## Contexte à lire
`apps/api/src/modules/conversations/README.md`, `apps/api/src/modules/fans/README.md`, `docs/architecture/message-flow.md` §1, §3, §5, §8, `data-model.md`, `docs/architecture/modules.md` (graphe et inversions), `docs/conventions/api.md`, ADR 0006, 0007.

## À faire
- `domain/` : machine d'état `ConversationState` (transitions autorisées, erreurs sinon), `DraftStatus`, règles `canSend(draft, conversation)`, `debounceFor(conversation, persona?)` (défaut 45 s, pur), types internes.
- `domain/ports.ts` : `ConversationRepository`, `MessageRepository`, `EventWriter`, `JobEnqueuer`, `Clock`, et `OutboundSender` (`sendText`, `sendMedia`, `verifySent`) que le module `connectors` implémentera en P0-06 (inversion de dépendance : `conversations` ne dépend pas de `connectors`).
- `application/` : `ingestMessage` (résout le fan par `fans.upsertFanByPlatformId(platformAccountId, externalRef)` ; le module `fans` est créé minimalement ici : `createFansModule` expose `upsertFanByPlatformId` et `getFan` sur la table de P0-03), `createDraft` (vide pour l'instant : `bubbles: []`, le moteur arrive en P3), `approveDraft`, `rejectDraft`, `expireDraft`, `takeover`, `release`, `setMode`, `recordSendAttempt/Verified/Failed`, `appendEvent` (le seul chemin d'écriture d'événements, avec `seq` monotone par conversation via `select … for update` ou séquence par conversation). Les événements qui intéressent d'autres modules (`draft_created`, `message_sent`) sont aussi écrits dans l'outbox `domain_events`, dans la même transaction.
- `application/jobs/respond.ts` : squelette qui relit les gardes d'entrée (kill switch, mode, session), crée un draft vide, émet `draft_created`. `send.ts` : squelette qui appelle le port d'envoi et enregistre les événements.
- `infra/db/` : repositories Drizzle dans `withTenant` ; `infra/http/` sous `/v1` (`api.md`) : `GET /v1/conversations`, `GET /v1/conversations/:id` (messages + événements paginés), `POST /v1/conversations/:id/drafts/:draftId/approve|reject`, `POST /v1/conversations/:id/takeover|release|mode` ; `infra/jobs/` : enregistrement des tâches.
- `index.ts` : `createConversationsModule(deps)`.
- Outil `pnpm db:rebuild-projections <conversationId>` (script `rebuild-projections` de `apps/api`, alias racine déjà déclaré ; minimal : recalcule `state`, `last_*_at`, `unread_count` depuis le journal).
- Retirer le job `demo.echo` de P0-04 : sa preuve (file série, remplacement par `jobKey`) est désormais couverte par les tests de `respond`.

## Critères d'acceptation
- Test : le même `ExternalMessage` ingéré trois fois → un seul `messages`, un seul `message_received`, un seul job `respond`.
- Test : trois messages à 10 s d'intervalle → un seul job `respond` exécuté (replace), après le dernier + debounce.
- Test : transition interdite (approuver un draft `rejected`) → `DomainError`, aucun événement.
- Test : `rebuild-projections` reproduit l'état d'une conversation après 20 événements variés.
- Test : chaque commande écrit son événement dans la transaction (couper la transaction après l'écriture d'état → pas d'état sans événement).

## Hors périmètre
LLM, gardes, politique, UI.

## Notes de session

## Résultat (2026-10-17)

Fait :
- `domain/` : `state-machine.ts` (une table de transitions sert aux commandes et à la reconstruction ; machine des brouillons ; trois essais d'envoi), `projection.ts` (`applyEvent`, `rebuildProjection`), `rules.ts` (`debounceFor` 45 s borné à 30–90 s, `canSend`, clé d'idempotence par bulle), `errors.ts` (`conversation_not_found`, `draft_not_found`, `transition_conflict`, `draft_conflict`), `ports.ts` (dont `OutboundSender`, implémenté en P0-06).
- `application/` : `appendEvent` (seul chemin d'écriture : transition vérifiée, journal à `seq` monotone sous verrou de la conversation, projection, outbox `domain_events` pour `draft_created` et `message_sent`) ; commandes `ingestMessage`, `approveDraft`, `rejectDraft`, `expireDraft`, `takeover`, `release`, `setMode`, `rebuildProjection` ; jobs `respond` (gardes kill switch et session, brouillon vide) et `send` (bulle par bulle, reprise après les bulles déjà parties, `verifySent` sur issue inconnue, `send_failed` puis `error` au troisième essai, brouillon expiré si le fan a réécrit).
- `infra/` : unité de travail Drizzle dans `withTenant`, lecture paginée par curseur, routes `GET /v1/conversations`, `GET /v1/conversations/:id`, `…/messages`, `…/events`, `POST …/drafts/:draftId/approve|reject`, `POST …/takeover|release|mode`.
- Module `fans` minimal (`upsertFanByPlatformId`, `getFan`), contrats `conversations.ts` (DTO, pagination, corps des commandes) et `EventIdSchema`.
- Migration `0001_enqueue_job` : `public.enqueue_job`, `SECURITY DEFINER`, seul droit de `nirvana_app` sur Graphile, pour enfiler dans la transaction métier.
- `pnpm db:rebuild-projections <conversationId>`, `pnpm dev:crm`, runbook `docs/runbooks/local-dev.md`.
- `demo.echo` retiré ; les tests du worker passent sur une tâche de test (`test.slow`) et sur `conversation.send`.

Tests : 11 unitaires (machine d'état, règles, projection) et 15 d'intégration (les cinq critères de la fiche, envoi avec reprise, brouillon périmé, passage en `error` puis reprise humaine, kill switch, routes : pagination, détail, conflit, reprise, 403 hors périmètre, 404 et curseur invalide).

Écarts : un nouveau message du fan ou une reprise humaine expire les brouillons ouverts (ils répondraient à une conversation qui a bougé) ; un brouillon vide ne s'approuve pas (`draft_invalid`) ; `drafting` n'est pas encore utilisé (le brouillon est écrit dans la transaction qui quitte `pending`).

