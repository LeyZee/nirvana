# Guide design : Nirvana « Liquid Glass »

Dernière revue : 2026-10-16. Fiche : D-01. Code : `packages/design-system` (ADR 0015, proposed).

## Décisions de Charles (2026-10-16)

Réponses aux questions ouvertes de `brief.md` :

- **Identité propre à Nirvana**, pas les tokens IMPERA. Direction : le Liquid Glass d'iOS 26/27 sur une nuit chaude, avec **un seul accent, un néon rouge**. La palette violet/cyan de `docs/assets/banner.svg` n'est plus la référence de couleur.
- **En code, sans Figma.** La référence visuelle vivante est l'artifact « Nirvana » (design system publié par Claude, privé au compte de Charles : https://claude.ai/artifact/Aw5XKd8jae4xSNevjge2Ci). Le dépôt fait foi : si l'artifact et `packages/design-system` divergent, c'est le dépôt qui a raison.
- Nom et logo : pas de logo pour l'instant. Le nom s'écrit en Instrument Serif italique (`.nv-wordmark`).

## Où vivent les choses

| Fichier                                                 | Rôle                                                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/design-system/src/styles/tokens.css`          | **Seule source des valeurs** : variables `--nv-*`, Nuit par défaut, Jour sous `data-theme="light"`.                                                 |
| `packages/design-system/src/styles/theme.css`           | Pont Tailwind v4 : `bg-void`, `text-ink-muted`, `bg-neon-solid`, `rounded-lg`, `shadow-glass`, `backdrop-blur-regular`, `ease-spring`, `text-body`… |
| `packages/design-system/src/styles/components.css`      | Classes `nv-*` sans framework, appliquées aux composants shadcn/ui par `className`.                                                                 |
| `packages/design-system/src/index.ts`                   | Aides d'animation sans état (lumière du verre, déformation liquide, lentille, Island).                                                              |
| `packages/design-system/src/__tests__/contrast.test.ts` | Vérifie le contraste AA de chaque paire ci-dessous, dans les deux thèmes.                                                                           |

Les consommateurs et l'ordre d'import sont dans `packages/design-system/README.md`.

## Principes

1. **La nuit d'abord.** Nuit est le thème par défaut (usage le soir) ; Jour existe pour le bureau en plein jour.
2. **Un seul néon.** `neon` est une lumière, pas un remplissage. Une action néon par écran (`nv-btn--neon`), une surface teintée par écran (`nv-glass--neon`).
3. **Le verre a besoin de lumière.** Une surface de verre est posée sur `nv-aura` ou sur du contenu, jamais sur un aplat.
4. **La matière bouge, l'interface reste calme.** Ce qui se déplace (pouce, lentille, Island) se déforme sur un ressort ; le reste ne fait que des fondus.
5. **Le travail de l'IA se voit dans le dashboard.** Un brouillon garde son pointillé et son étiquette jusqu'à l'envoi vérifié (`send_verified`). C'est une information pour l'opérateur, pas un texte montré au fan (la politique d'identité, ADR 0012, ne change pas).

## Couleur

| Token                                                                                                         | Usage                                                                                                        |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `void`, `abyss`, `surface-raised`                                                                             | Fond de page ; colonnes encastrées ; cartes opaques et repli « Réduire la transparence ».                    |
| `ink`, `ink-muted`, `ink-faint`                                                                               | Texte principal ; secondaire ; métadonnées (heures, sources de faits, placeholders), jamais sous 11px.       |
| `neon`                                                                                                        | Halos, icônes actives, curseur, point « Rédaction ». Texte seulement à partir de 15px.                       |
| `neon-solid` + `on-neon`                                                                                      | Bouton principal, interrupteur activé, bulle de la créatrice.                                                |
| `neon-ink` sur `neon-soft`                                                                                    | Petites étiquettes néon : « Brouillon », onglet actif, fait déclaré.                                         |
| `glass-veil`, `glass-fill`, `glass-fill-strong`, `glass-thick`, `glass-edge`, `glass-specular`, `glass-sheen` | Matière du verre (voir plus bas).                                                                            |
| `aura-neon`, `aura-wine`, `aura-rose`                                                                         | Lueurs floues derrière le verre.                                                                             |
| `success` (cyan), `warning`, `danger`, `sale`                                                                 | Envoi vérifié ; à valider ; erreur ; vente. Toujours avec un mot ou une icône : `danger` est proche du néon. |
| `focus`                                                                                                       | Anneau de focus, 2px plein, décalé de 3px.                                                                   |

Contraste garanti par le test : `ink`, `ink-muted`, `ink-faint` ≥ 4,5:1 sur `void`, `abyss`, `surface-raised` et sur le verre au pire cas (au-dessus du point le plus lumineux de l'aura) ; `neon`, `neon-ink`, `danger`, `success`, `warning`, `sale` ≥ 4,5:1 sur `void` ; `on-neon` ≥ 4,5:1 sur `neon-solid` ; `focus` ≥ 3:1 sur `void` et `surface-raised`. Modifier un token qui casse une paire fait échouer `pnpm test`.

## Le verre : où oui, où non

| Épaisseur | Classe                     | Pour                                                                                                    |
| --------- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| Fin       | `nv-glass nv-glass--thin`  | Lentilles, pouces, petits boutons.                                                                      |
| Régulier  | `nv-glass`                 | Barre latérale, en-têtes, cartes flottantes, conteneur de liste, panneau de brouillon, champ de saisie. |
| Épais     | `nv-glass nv-glass--thick` | Island (notification), menus, dialogues.                                                                |

- **Oui** : les surfaces de chrome (barres, panneaux, cartes flottantes, conteneurs).
- **Non** : chaque ligne d'une liste (`nv-convo` n'a pas de `backdrop-filter`, c'est le conteneur qui est vitré) ; chaque bulle d'un fil (`nv-bubble--fan` imite le verre sans flou : un fil peut compter des centaines de bulles).
- Deux couches de verre empilées au plus. Pas de bordure ajoutée : le liseré spéculaire fait le contour.
- Le voile `glass-veil` sous le remplissage est ce qui garde le texte lisible sur une aura vive. Ne pas le retirer.
- `prefers-reduced-transparency` remplace le verre par `surface-raised`.

## Typographie, espacement, rayons

- **Geist** pour l'interface (`text-body` 15/21 par défaut), titres serrés (`large-title`, `title-1`, `title-2`). **Instrument Serif italique** pour le nom et les états vides (`whisper`), jamais pour un bouton ou un message. **Geist Mono** pour les chiffres et métadonnées, chiffres tabulaires. Plancher : `caption` 11px.
- Grille de 4px (`space-1` à `space-12`).
- Tout ce qui se touche est une capsule (`radius-full`) ; bulles `radius-md`, cartes `radius-lg`, Island et dialogues `radius-xl`. Rayons concentriques : rayon intérieur = rayon extérieur − padding.

## États

- **Survol** : halo néon `shadow-neon` → `shadow-neon-strong` ; lignes de liste en `glass-fill`.
- **Focus clavier** : anneau `focus` sur tout élément interactif, champs compris (`shadow-focus`). Visible sur verre dans les deux thèmes.
- **Actif** : `scale(0.96)` en `dur-instant`, retour sur `ease-spring`.
- **Sélection** : `neon-soft` (conversation ouverte, onglet actif).
- **Désactivé** : opacité 0,4, sans ombre. Pendant un envoi, le bouton reste visible avec un libellé d'état.

Pastilles d'état (`nv-status--<état>`) : une par valeur de `conversations.state` (`data-model.md`) : `idle`, `pending`, `drafting` (respire), `awaiting-approval`, `sending` (respire), `human`, `paused`, `error`, plus `sale`. Libellés : Au calme, En attente, Rédaction, À valider, Envoi, Humain, En pause, Erreur, Vente.

## Mouvement

- Durées : `dur-instant` (pression), `dur-fast` (couleurs), `dur-base` (états), `dur-slow` (déplacement de matière), `dur-ambient` (aura).
- Courbes : `ease-spring` pour ce qui se déplace ou change de taille, `ease-spring-bouncy` pour les pouces d'interrupteur et l'Island, `ease-out` pour les apparitions.
- Signature : pression à ressort ; pouces et lentilles qui s'écrasent pendant leur trajet (`playLiquid`) ; bulles qui montent de 8px en entrant ; Island qui naît d'une capsule ; aura qui dérive.
- **Le verre ne ralentit jamais le clavier** : approuver, éditer, rejeter, suivant, précédent ne déclenchent aucune animation bloquante ; le focus passe au brouillon suivant immédiatement.
- `prefers-reduced-motion` : ressorts instantanés, boucles arrêtées ; tout reste lisible au repos.

## Inbox copilote (apps/web)

- Raccourcis (`apps/web/README.md`) : `a` approuver, `e` éditer, `r` rejeter, `j` / `k` suivant / précédent. Chaque bouton du panneau de brouillon (`nv-draft-panel`) affiche sa touche (`nv-kbd`).
- Le panneau montre le brief en une ligne, le fil, le brouillon étiqueté, puis les faits utilisés et la latence en `nv-meta`.
- Cibles ≥ 44px : les contrôles compacts (`nv-btn--sm`, `nv-iconbtn`, `nv-switch`) gardent une zone de clic de 44px autour d'un visuel plus petit.

## Correspondance avec shadcn/ui

Quand D-01 initialisera shadcn/ui dans `apps/web`, ses variables sémantiques pointent vers les tokens (et non l'inverse) :

| shadcn                               | Nirvana                                                        |
| ------------------------------------ | -------------------------------------------------------------- |
| `--background` / `--foreground`      | `--nv-void` / `--nv-ink`                                       |
| `--card`, `--popover`                | `--nv-surface-raised` (les cartes vitrées ajoutent `nv-glass`) |
| `--primary` / `--primary-foreground` | `--nv-neon-solid` / `--nv-on-neon`                             |
| `--muted-foreground`                 | `--nv-ink-muted`                                               |
| `--accent`                           | `--nv-neon-soft`                                               |
| `--destructive`                      | `--nv-danger`                                                  |
| `--border`, `--input`                | `--nv-hairline`, `--nv-fill-track`                             |
| `--ring`                             | `--nv-focus`                                                   |
| `--radius`                           | `--nv-radius-lg`                                               |

Le bloc de couleurs généré par `shadcn init` est supprimé au profit de cette correspondance : une seule source.

## Extension Chrome

Le popup (capture de session, enregistreur) importe `@nirvana/design-system/styles.css` : en-tête `nv-popup__brand`, état de la session (`platform_session` : valide, à surveiller, expirée) en `nv-status`, un bouton néon « Synchroniser la session ». Pas de verre au-dessus de Reveal : l'extension n'injecte aucun style dans la page Reveal.

## Ce qui reste (fiche D-01)

Bloqué par P0-01 (apps non initialisées) : restylage des composants shadcn/ui, page `_playground.tsx`, test axe-core en CI, auto-hébergement des polices si la politique réseau du dashboard l'exige.
