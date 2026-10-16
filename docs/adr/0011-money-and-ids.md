# 0011. Argent en unités mineures entières ; identifiants UUID v7 typés

Statut : accepted
Date : 2026-10-16

## Contexte

Les prix, remises, ventes et coûts LLM demandent de l'arithmétique exacte. Les identifiants doivent être générés côté application (transactions, idempotence), triables par temps, et impossibles à confondre entre entités (un `fanId` passé là où un `conversationId` est attendu est une classe de bug courante).

## Décision

- **Argent** : `{ amountMinor: number (entier), currency: 'EUR' | … }` partout ; en base `amount_minor integer` + `currency char(3)`. Jamais de `float`, jamais de montant sans devise. Helpers dans `packages/contracts/src/money.ts`. Affichage formaté uniquement dans l'UI.
- **Identifiants** : **UUID v7** générés par l'application (`packages/contracts/src/ids.ts`), **typés par marque** (`FanId`, `ConversationId`, … via `z.string().uuid().brand<'FanId'>()`). Les identifiants externes (plateformes) sont des `string` opaques dans des champs `platform_<x>_id`.
- **Temps** : `timestamptz` en base, `Date` ISO en transit, UTC partout, conversion dans le fuseau de la créatrice uniquement pour l'affichage et les règles d'horaires (`creators.timezone`).

## Conséquences

- Pas d'erreur d'arrondi, pas de confusion d'identifiants au typage, tri chronologique gratuit sur les clés.
- Coût : quelques conversions explicites. Acceptées.

## Alternatives rejetées

- `numeric` en base + `number` en TS : perte de précision à la frontière.
- UUID v4 : non triable, index moins efficaces.
- Identifiants entiers auto-incrémentés : générés par la base, pas par l'application ; fuite d'information (volume).
