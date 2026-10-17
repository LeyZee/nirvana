# 2026-10-17 — README à jour et design system en images — done

Fait : README réécrit sur l'état réel de `main` et des PR ouvertes (fait, en PR, pas commencé), modèles IA par rôle, design system en images, commandes qui marchent aujourd'hui ; cinq planches dans `docs/design/images/` (composants Nuit et Jour, palette, typographie, marque) rendues depuis le CSS du package ; section « En images » dans `docs/design/README.md` et « Ce qui reste » mis à jour (débloqué par P0-01) ; aperçu dans `brand/README.md`.
Pas fait : aucun changement de tokens ni de classes.
Décisions : aucune.
Découvertes : les planches sont rendues par un script jetable (Chromium headless, Playwright) non versionné ; s'il faut les refaire souvent, un script de rendu versionné vaudrait la peine.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓ (96 tests) ; planches regardées en grand et en petit ; planches en JPEG qualité 90 (dégradés de l’aura trop lourds en PNG, limite de 500 Ko), la marque en PNG.
