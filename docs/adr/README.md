# ADR : décisions d'architecture

Une ADR (Architecture Decision Record) fige une décision structurante avec son contexte, pour qu'une session future ne la rouvre pas sans savoir pourquoi elle a été prise.

## Règles

- Une ADR est **immuable** une fois `accepted`. Pour changer d'avis : nouvelle ADR qui `supersedes` l'ancienne (l'ancienne passe en `superseded`).
- Statuts : `proposed` (une session Opus peut en créer une) → `accepted` (Charles ou la session d'architecture) → `superseded` / `rejected`.
- Numérotation séquentielle à 4 chiffres, nom `NNNN-slug.md`.
- Une session de code qui prend une décision structurante non couverte **doit** créer une ADR `proposed` et le dire dans sa fiche de tâche. Elle ne doit pas passer outre une ADR `accepted`.

## Gabarit

```
# NNNN. Titre
Statut : proposed | accepted | superseded by NNNN | rejected
Date : AAAA-MM-JJ
## Contexte
## Décision
## Conséquences (positives, négatives, à surveiller)
## Alternatives rejetées
```

## Index

| N° | Titre | Statut |
|---|---|---|
| 0001 | TypeScript, monorepo pnpm + Turborepo | accepted |
| 0002 | Monolithe modulaire, frontières vérifiées par ESLint | accepted |
| 0003 | Cœur agnostique de la plateforme (y compris notre future plateforme sans abonnement) | accepted |
| 0004 | Fastify plutôt que NestJS | accepted |
| 0005 | Postgres + Drizzle + RLS par `creator_id` | accepted |
| 0006 | Graphile Worker, une file série par conversation | accepted |
| 0007 | Journal d'événements de conversation comme source de vérité | accepted |
| 0008 | Port `PlatformConnector` ; Reveal via session capturée et client API serveur | accepted |
| 0009 | Passerelle LLM unique, trois rôles, règles métier dans le code | accepted |
| 0010 | Persona = donnée versionnée (YAML + schéma Zod), pas du code | accepted |
| 0011 | Argent en unités mineures entières ; identifiants UUID v7 typés | accepted |
| 0012 | `identity_policy` configurable, défaut `stay_in_character` | superseded (0021) |
| 0013 | Code en anglais, documentation, UI et persona en français | accepted |
| 0014 | Politique d'hygiène du dépôt | accepted |
| 0015 | Design system partagé dans `packages/design-system` | accepted |
| 0016 | Clés des fournisseurs IA saisies dans le dashboard, chiffrées en base | accepted |
| 0017 | Vision : Gemini en natif, bascule sur Grok en images clés | accepted |
| 0018 | Port connecteur étendu : scripts natifs, notes, coffre, médias, garde d'écriture | accepted |
| 0019 | Deux taux (au playground, en réel) et la règle qui ouvre le mode Automatique | accepted |
| 0020 | Notifications Telegram : bots, groupes et routage gérés depuis le CRM | proposed |
| 0021 | Rester en personnage est fixé dans le code, sans réglage | accepted |
