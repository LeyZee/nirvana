# Marque Nirvana

Le logo est une flamme à l'auréole : une flamme pleine, cambrée, qui brûle sous un halo elliptique. Le tracé a été dessiné par Charles le 16 octobre 2026 ; sa géométrie n'est pas retouchée ici, les fichiers de ce dossier n'en sont que des déclinaisons.

## Fichiers

| Fichier | Quoi | Quand |
| --- | --- | --- |
| `brand/nirvana-mark.svg` | Le symbole seul, en couleur (dégradé verre + auréole) | Partout où le symbole est affiché à 48 px ou plus : en-têtes, écrans de connexion, cartes |
| `brand/nirvana-mark-mono.svg` | Le symbole en une couleur (`currentColor`, néon par défaut) | Petites tailles, impression, incrustation sur photo, icône dans une barre d'outils |
| `brand/favicon.svg` | Le symbole mono avec une auréole épaissie, cadré serré | Favicon et icônes d'app (lisible dès 16 px) ; à copier dans `public/` des apps par la fiche qui les crée |
| `brand/nirvana-lockup.svg` | Symbole + nom « Nirvana » dans la matière de la flamme, auréole à la place du point du i | Sur fond Nuit (`void`, `abyss`, verre) |
| `brand/nirvana-lockup-jour.svg` | Même lockup, dégradé du nom plus foncé pour rester lisible | Sur fond Jour |
| `brand/nirvana-lockup-mono.svg` | Lockup en une couleur | Signatures, documents, partenaires |
| `brand/banner.svg` | La bannière du README (nuit, aura, lockup) | En-tête du README, pages d'accueil de dépôt |

Le nom dans les lockups est un tracé vectorisé d'Instrument Serif italique (Google Fonts, licence OFL), pour que le rendu ne dépende pas d'une police installée (GitHub n'en charge aucune dans un SVG). Dans l'interface, le nom reste du texte en `.nv-wordmark`.

## Règles

- **Une seule version par contexte.** Couleur dès que la place le permet, mono en dessous de 48 px ou quand le fond est chargé. Ne pas mélanger les deux sur un même écran.
- **Zone de protection** : autour du symbole, laisser au moins la largeur de l'auréole libre de tout texte ou bord.
- **Ne pas** recolorer le dégradé, incliner ou étirer le symbole, séparer l'auréole de la flamme, ajouter un contour, un fond ou une ombre dure. Le mono se teinte par `color` (`currentColor`), jamais en éditant le fichier.
- **Taille minimale** : 24 px pour le mono, 48 px pour la couleur, 16 px pour `favicon.svg` uniquement.
- **Couleurs** : le symbole couleur a sa propre palette (verre rose `#ffb4bb` → rouge `#ea123b`, auréole `#ff3659` / `#ffb0b9` / `#ff234c`), proche des tokens `neon-solid`, `neon` et `neon-ink` sans leur être égale. Le mono prend `neon` (`#ff2a4d`) sur Nuit, `#cc0029` sur Jour si le contraste l'exige.

## Déclinaisons et comment elles ont été faites

- `nirvana-mark.svg` : le dessin de Charles, recadré au carré sur le contenu (viewBox `144 54 440 440` environ), identifiants de dégradés préfixés `nv-`, `<title>` et `aria-label` ajoutés.
- `nirvana-mark-mono.svg` et `favicon.svg` : même flamme en aplat `currentColor`, auréole en trait plein (10 puis 22 d'épaisseur), sans reflet.
- Lockups et bannière : symbole à 150 de haut, nom en Instrument Serif italique 118, hauteur de capitale centrée sur le corps de la flamme, glyphes vectorisés avec fontTools + HarfBuzz (crénage inclus). Le point du i est remplacé par une petite auréole inclinée à −19°, comme celle du symbole. Le nom est rempli du dégradé de la flamme (rose `#ffb4bb` vers rouge `#ea123b` sur Nuit ; `#ff6b80` vers `#b8002a` sur Jour), avec son liseré, et épaissi d'un trait de 1,6 pour tenir à côté d'elle. Rien à régénérer en routine : pour modifier le nom ou l'espacement, repartir du `.ttf` de Google Fonts avec les mêmes outils.
