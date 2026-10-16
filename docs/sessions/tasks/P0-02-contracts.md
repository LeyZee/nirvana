# P0-02 Contrats partagés : identifiants, argent, événements, jobs

Statut : todo
Phase : 0
Dépend de : P0-01
Branche : task/p0-02-contracts

## Objectif
Fournir dans `packages/contracts` les types et schémas Zod que tout le reste importe, sans aucune logique d'I/O.

## Contexte à lire
`docs/architecture/data-model.md`, `docs/glossary.md`, ADR 0011, 0007, 0006, `docs/conventions/coding.md`.

## À faire
- `ids.ts` : `newId()` UUID v7, marques `CreatorId`, `PlatformAccountId`, `FanId`, `ConversationId`, `MessageId`, `DraftId`, `MediaAssetId`, `PersonaVersionId`, `UserId` (schémas Zod `.brand()` + types).
- `money.ts` : `Money { amountMinor: number; currency: Currency }`, `Currency` enum (`EUR` au minimum), helpers `add`, `multiplyPercent`, `format` (sans locale ici, juste chaîne brute), tous testés.
- `enums.ts` : `Platform`, `ConversationState`, `ConversationMode`, `DraftStatus`, `MessageDirection`, `MessageAuthor`, `SessionState`, `FactCategory`, `FactKind`, `LlmRole`, `IdentityPolicy`.
- `events.ts` : union discriminée des types d'événements de `data-model.md` avec payload Zod par type ; `ConversationEventSchema`.
- `jobs.ts` : noms de jobs (`conversation.respond`, `conversation.send`, `conversation.follow_up`, `connector.poll`, `connector.reconcile`, `fans.refresh_summary`, `media.describe`) et payloads Zod ; helper `queueNameFor(conversationId)` et `jobKeyFor(job, conversationId)`.
- `connector.ts` : `ExternalRef`, `ConversationSnapshot`, `ExternalMessage`, `OutboundMedia`, `SendResult`, `VerifyResult`, `ConnectorCapabilities`, `ConnectorErrorCode`.
- `settings.ts` : `CreatorSettingsSchema` (avec `identity_policy` défaut `stay_in_character`, `llm` par rôle, `followUp`, `auto_approve_categories` vide par défaut, `retention`).
- `persona.ts` : `PersonaSchema` selon `docs/reference/persona-schema.md` ; `media.ts` : `MediaDescriptionSchema` selon `media-vocabulary.md`.
- `result.ts` : `Result<T, E>` (neverthrow réexporté ou implémentation locale, choix noté dans la fiche) et `DomainError`.
- `index.ts` exporte tout ; tests unitaires sur ids, money, settings (défauts), persona (le `v0.yaml` placeholder doit valider).

## Critères d'acceptation
- `pnpm --filter @nirvana/contracts test` vert, couverture des helpers money à 100 %.
- `personas/messalina/v0.yaml` passe `PersonaSchema`.
- Aucune dépendance runtime dans le package à part `zod` et `uuid` (ou `node:crypto`).

## Hors périmètre
Schéma Drizzle, routes, prompts.

## Notes de session
