# D-01 Design system « Liquid Glass »

Statut : todo
Phase : 4 (à livrer avant le premier écran du dashboard, après P0-07)
Dépend de : P0-01
Branche : task/d-01-design-system

## Objectif
Donner à Nirvana une identité visuelle moderne et épurée inspirée du Liquid Glass d'iOS 26 et 27, sous forme de tokens Tailwind v4, de composants shadcn/ui restylés et d'un guide, sans compromettre l'usage au clavier ni la lisibilité.

## Contexte à lire
`docs/design/brief.md` (intention, contraintes, livrables, questions ouvertes), `apps/web/README.md`, `docs/architecture/message-flow.md` (mode copilote), `docs/assets/banner.svg` (direction visuelle).

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
