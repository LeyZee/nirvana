# P0-02 Contrats partagés : identifiants, argent, événements, jobs

Statut : todo
Phase : 0
Dépend de : P0-01
Branche : task/p0-02-contracts

## Objectif
Fournir dans `packages/contracts` les types et schémas Zod que tout le reste importe, sans aucune logique d'I/O.

## Contexte à lire
`docs/architecture/data-model.md` (dont la table des payloads d'événements et la section `domain_events`), `docs/architecture/connectors.md` (types cités par le port), `docs/glossary.md`, ADR 0011, 0007, 0006, `docs/conventions/coding.md`.

## À faire
- `ids.ts` : `newId()` UUID v7 via `v7()` de `uuid`, marques `CreatorId`, `PlatformAccountId`, `FanId`, `ConversationId`, `MessageId`, `DraftId`, `MediaAssetId`, `PersonaVersionId`, `UserId` (schémas Zod `.brand()` + types).
- `money.ts` : `Money { amountMinor: number; currency: Currency }`, `Currency` enum (`EUR` au minimum), helpers `add`, `multiplyPercent`, `format` (sans locale ici, juste chaîne brute), tous testés.
- `enums.ts` : `Platform`, `ConversationState`, `ConversationMode`, `DraftStatus`, `MessageDirection`, `MessageAuthor`, `SessionState`, `FactCategory`, `FactKind`, `LlmRole`, `IdentityPolicy`. Des `z.enum` et leurs types inférés, jamais d'`enum` TypeScript (ESLint le refuse).
- `events.ts` : union discriminée des types d'événements de `data-model.md` avec payload Zod par type (la table des payloads y est la référence) ; `ConversationEventSchema` ; `DomainEventSchema` pour l'outbox `domain_events` (`draft_created`, `message_sent`, `fact_confirmed`, …, types pris dans la même liste fermée), avec `correlationId`.
- `jobs.ts` : noms de jobs (`conversation.respond`, `conversation.send`, `conversation.follow_up`, `connector.poll`, `connector.reconcile`, `fans.refresh_summary`, `media.describe`) et payloads Zod ; helper `queueNameFor(conversationId)` et `jobKeyFor(job, conversationId)`.
- `connector.ts` : `ExternalRef`, `ConversationSnapshot`, `ExternalMessage`, `ExternalTransaction`, `OutboundMedia`, `SendResult`, `VerifyResult`, `ConnectorCapabilities`, `ConnectorErrorCode`, `ConnectorEvent`, `Unsubscribe` (tous cités par `connectors.md`).
- `settings.ts` : `CreatorSettingsSchema` (avec `identity_policy` défaut `stay_in_character`, `llm` par rôle, `followUp`, `auto_approve_categories` vide par défaut, `retention`).
- `persona.ts` : `PersonaSchema` selon `docs/reference/persona-schema.md` ; `media.ts` : `MediaDescriptionSchema` selon `media-vocabulary.md`.
- `result.ts` : `Result<T, E>` en implémentation locale (`ok`, `err`, `isOk`, `map`, `unwrapOr`), pas de `neverthrow` (décision prise, `coding.md`) ; `DomainError`.
- `index.ts` exporte tout ; tests unitaires sur ids, money, settings (défauts), persona (le `personas/messalina/v0.0.0.yaml` placeholder doit valider).

## Critères d'acceptation
- `pnpm --filter @nirvana/contracts test` vert, couverture des helpers money à 100 %.
- `personas/messalina/v0.0.0.yaml` passe `PersonaSchema`.
- Aucune dépendance runtime dans le package à part `zod` et `uuid` (ou `node:crypto`).

## Hors périmètre
Schéma Drizzle, routes, prompts.

## Notes de session
