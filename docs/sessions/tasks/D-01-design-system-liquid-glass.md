# D-01 Design system « Liquid Glass »

Statut : in_progress
Phase : 4 (à livrer avant le premier écran du dashboard, après P0-07a)
Dépend de : P0-01
Branche : task/d-01-design-system

## Objectif
Donner à Nirvana une identité visuelle moderne et épurée inspirée du Liquid Glass d'iOS 26 et 27, sous forme de tokens Tailwind v4, de composants shadcn/ui restylés et d'un guide, sans compromettre l'usage au clavier ni la lisibilité.

## Contexte à lire
`docs/design/brief.md` (intention, contraintes, livrables, questions ouvertes), `apps/web/README.md`, `docs/architecture/message-flow.md` (mode copilote), `brand/banner.svg` (bannière actuelle, logo dans `brand/README.md`).

## À faire
- Trancher les questions ouvertes du brief avec Charles (identité propre ou tokens IMPERA ; maquettes ou code) et consigner la réponse dans `docs/design/README.md`.
- `apps/web/src/styles/tokens.css` : `@theme` Tailwind v4 (couleurs, surfaces vitrées à 3 niveaux, rayons, ombres, bords, flous, typographie, espacements, animations), modes sombre et clair.
- Restyler les composants shadcn/ui de base (bouton, carte, panneau latéral, dialogue, toast, badge, interrupteur, champ) ; ajouter bulle de message, carte de conversation, panneau de draft.
- Page `apps/web/src/routes/_playground.tsx` (dev seulement) qui montre tous les composants dans les deux modes.
- `docs/design/README.md` : règles du verre (où oui, où non), états, animations, accessibilité, performance.
- Mesurer : contraste AA sur chaque surface vitrée ; `backdrop-filter` absent des lignes de liste ; `prefers-reduced-motion` respecté.

## Critères d'acceptation
- La page playground rend tous les composants en sombre et en clair sans régression de contraste (vérifié par un test axe-core en CI).
- Le guide est relu et accepté par Charles.
- Aucune dépendance d'UI ajoutée hors shadcn/ui, Radix et Tailwind.

## Hors périmètre
Les écrans fonctionnels (inbox, conversation, fan, supervision) : ils arrivent en phase 4 et consomment ce design.

## Notes de session

2026-10-16 (Opus 5.5, à la demande de Charles, avant P0-01) :
- Questions du brief tranchées par Charles : identité propre, néon rouge sur nuit, en code. Consigné dans `docs/design/README.md`.
- Le design system sert aussi le popup de l'extension : tokens et classes dans `packages/design-system` au lieu de `apps/web/src/styles/` (ADR 0015 proposed). `apps/web` importera `tokens.css` et `theme.css` depuis le package.
- Fait : tokens (Nuit, Jour), pont Tailwind v4, classes de composants (verre, boutons, segments, interrupteur, barre d'onglets, carte de conversation, pastilles d'état, bulles, panneau de brouillon, champ, faits, Island, popup), aides d'animation, test de contraste AA dans les deux thèmes, guide.
- Reste, bloqué par P0-01 : restyler les composants shadcn/ui, `apps/web/src/routes/_playground.tsx`, test axe-core en CI. `pnpm check` non exécuté (pas de `pnpm install` avant P0-01) ; typecheck strict et tests (27) vérifiés à part.
