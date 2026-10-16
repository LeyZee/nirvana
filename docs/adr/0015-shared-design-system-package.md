# 0015. Design system partagé dans `packages/design-system`

Statut : proposed
Date : 2026-10-16

## Contexte

La fiche D-01 et le brief design placent les tokens dans `apps/web/src/styles/tokens.css`. Charles demande que le design system serve aussi l'extension Chrome (popup : capture de session, enregistreur, état de la session). L'extension ne peut pas importer `apps/web`, et dupliquer les tokens dans deux apps ferait diverger les couleurs dès la première retouche. L'ADR 0001 admet un package quand il est consommé par au moins deux apps.

## Décision

- Un package **`@nirvana/design-system`** (`packages/design-system/`) porte la seule source des valeurs visuelles et ce qui en dépend directement :
  - `src/styles/tokens.css` : variables CSS `--nv-*`, thème Nuit par défaut, thème Jour sous `data-theme="light"`, sans framework ;
  - `src/styles/theme.css` : pont Tailwind v4 (`@theme inline`) qui expose les tokens en utilitaires ;
  - `src/styles/components.css` : classes `nv-*` sans framework (verre, boutons, bulles, pastilles d'état…) ;
  - `src/index.ts` : aides d'animation sans état (lumière du verre, déformation liquide, lentille), sans dépendance.
- `apps/web` importe les CSS et applique les classes aux composants shadcn/ui ; `apps/extension` importe les mêmes CSS dans son popup.
- La règle de frontière ESLint `app → package` autorise `design-system` en plus de `contracts`.
- Le package ne contient ni React ni shadcn/ui : les composants React restent dans `apps/web` (fiche D-01), pour ne pas imposer React à l'extension.

## Conséquences

- Une seule source pour les couleurs, rayons, flous, durées et courbes ; un test (`contrast.test.ts`) vérifie le contraste AA de chaque paire promise, dans les deux thèmes.
- Coût : un package de plus à maintenir ; `apps/web/README.md` et la fiche D-01 renvoient désormais vers lui.
- À surveiller : si un composant React finit par servir aux deux apps, il faudra trancher entre React dans l'extension et une duplication assumée. Ne pas le décider avant d'en avoir besoin.

## Alternatives rejetées

- **Tokens dans `apps/web` seulement** : l'extension copie les valeurs à la main, elles divergent.
- **Package `ui` avec composants React** : force React dans le popup de l'extension et mélange le design et la logique d'écran.
- **Tokens en JSON générés vers CSS** : un script et un format de plus pour un fichier que Tailwind v4 lit déjà nativement.
