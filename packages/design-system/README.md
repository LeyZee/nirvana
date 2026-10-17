# @nirvana/design-system

Le design system « Liquid Glass » de Nirvana : tokens, pont Tailwind v4, classes de composants et aides d'animation. Consommé par `apps/web` et `apps/extension` (ADR 0015). Règles d'usage : `docs/design/README.md`.

## Contenu

| Export                                  | Fichier                     | Rôle                                                                                                                                |
| --------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `@nirvana/design-system/tokens.css`     | `src/styles/tokens.css`     | Seule source des valeurs (`--nv-*`). Nuit par défaut, Jour sous `data-theme="light"`.                                               |
| `@nirvana/design-system/theme.css`      | `src/styles/theme.css`      | Pont Tailwind v4 (`@theme inline`) : utilitaires `bg-void`, `text-ink`, `rounded-lg`, `shadow-glass`…                               |
| `@nirvana/design-system/components.css` | `src/styles/components.css` | Classes `nv-*` sans framework.                                                                                                      |
| `@nirvana/design-system/base.css`       | `src/styles/base.css`       | Styles de page (`body`, sélection, focus). Jamais dans une page tierce.                                                             |
| `@nirvana/design-system/fonts.css`      | `src/styles/fonts.css`      | Geist, Geist Mono, Instrument Serif, Playfair Display italique (le nom).                                                            |
| `@nirvana/design-system/styles.css`     | `src/styles/index.css`      | Les quatre précédents (sauf `theme.css`), dans l'ordre.                                                                             |
| `@nirvana/design-system`                | `src/index.ts`              | `attachGlassLight`, `playLiquid`, `placeTabBarLens`, `placeSegmentThumb`, `collapseIsland`, `expandIsland`, `prefersReducedMotion`, `countUp` ; géométrie des graphiques `nv-chart` (`chartPoints`, `linePath`, `areaPath`, `niceTicks`, `nearestIndex`, dans `src/chart.ts`). |

## Utilisation

`apps/web` (Tailwind v4) :

```css
@import '@nirvana/design-system/fonts.css';
@import 'tailwindcss';
@import '@nirvana/design-system/tokens.css';
@import '@nirvana/design-system/theme.css';
@import '@nirvana/design-system/base.css';
@import '@nirvana/design-system/components.css';
```

`apps/extension` (popup) :

```ts
import '@nirvana/design-system/styles.css';
```

Thème : rien à faire pour Nuit ; `document.documentElement.dataset.theme = 'light'` pour Jour.

Les aides d'animation ne gardent aucun état : le composant React garde l'onglet ou l'option sélectionnés et appelle l'aide dans un effet.

```tsx
useEffect(() => attachGlassLight(ref.current), []);
```

## Règles

- Une valeur visuelle (couleur, rayon, durée, courbe, taille de texte) n'existe que dans `tokens.css`. Les autres fichiers s'y réfèrent par `var(--nv-*)`.
- Changer un token de couleur : lancer `pnpm --filter @nirvana/design-system test` ; le test de contraste dit quelle paire casse.
- Pas de React ni de dépendance d'UI dans ce package (ADR 0015).
