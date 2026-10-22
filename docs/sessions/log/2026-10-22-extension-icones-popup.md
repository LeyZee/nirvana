# 2026-10-22 — Extension : icônes, paquet zip, marge du popup (recette) — done
Fait : icônes 16, 32, 48 et 128 px dans `apps/extension/public/icon/`, tirées de `brand/favicon.svg` sans retouche (rendu Chromium à 1 024 px puis réduit), et le symbole lui-même à côté du nom dans le popup ; WXT les déclare dans le manifeste. Script `zip` (`wxt zip`) pour le paquet à installer. Le popup prend le cadre `nv-popup` du design system (marge de 16 px) avec le nom et une phrase qui dit qu'il n'y a encore rien à y faire ; `title.ts` n'avait plus d'usage et part. Tests : tailles des icônes lues dans l'en-tête PNG, cadre et symbole du popup.
Pas fait : contenu du popup (capture de session, enregistreur), qui arrive avec ses fiches.
Décisions : aucune.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓ (extension), `pnpm --filter @nirvana/extension build` et `zip` ✓ (manifeste avec `icons`).
