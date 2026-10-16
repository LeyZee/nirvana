# 0002. Monolithe modulaire, frontières vérifiées par ESLint

Statut : accepted
Date : 2026-10-16

## Contexte

Charles exige « pas de spaghetti » et une architecture modulaire et évolutive. Les microservices seraient disproportionnés pour une créatrice et une centaine de conversations. Le risque réel est la dérive : un monolithe où tout importe tout.

## Décision

- **Un seul déployable** (`apps/api`), découpé en **modules métier** (`connectors`, `conversations`, `fans`, `persona`, `agent`, `media`, `supervision`, puis `sales`, `scripts`).
- Chaque module suit `domain/` (pur) → `application/` (cas d'usage) → `infra/` (I/O) et n'expose que son `index.ts`.
- Le graphe de dépendances entre modules est explicite (`docs/architecture/modules.md`) et **appliqué par `eslint-plugin-boundaries`** : un import interdit casse la CI.
- Injection de dépendances **manuelle** : `createXModule(deps)` et un `composition-root.ts` qui câble tout. Pas de conteneur DI.
- Communication inter-modules : appel via `index.ts`, ou événements de domaine (outbox) pour découpler.

## Conséquences

- Les modules peuvent être extraits en services plus tard sans réécriture (les ports existent déjà).
- Les sessions Opus ont un cadre mécanique : si le lint passe, la structure est respectée.
- Coût : un peu de cérémonie (ports, index, DI manuelle). Acceptée.
- À surveiller : la tentation de « juste importer » un repository d'un autre module. La règle lint le refuse ; ne jamais désactiver la règle (CLAUDE.md).

## Alternatives rejetées

- **Microservices** : coût opérationnel sans bénéfice à cette échelle.
- **NestJS** (modules + DI intégrés) : voir ADR 0004.
- **Monolithe sans frontières outillées** : la dérive est certaine avec plusieurs sessions de code indépendantes.
