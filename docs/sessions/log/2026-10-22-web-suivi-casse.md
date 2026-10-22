# 2026-10-22 — Suivi : `reader.ts` renommé, le typecheck repasse sous Windows et macOS — done
Fait : `apps/web/src/screens/tracking/` contenait `Reader.tsx` et `reader.ts` depuis #109. Sur un système de fichiers insensible à la casse (Windows, macOS), TypeScript les prend pour un seul fichier (TS1149, TS1261) et `pnpm check` casse ; Linux et la CI ne voyaient rien (relevé sur le PC de Charles). `reader.ts` devient `reader-model.ts` (et son test), imports ajustés. Un test (`src/module-names.test.ts`) refuse désormais deux modules d'un même dossier qui ne diffèrent que par la casse ; il échoue sur l'ancien nom.
Pas fait : rien.
Décisions : aucune.
Découvertes : le reste du dépôt n'a aucun autre cas (recherche sur tous les `.ts`, `.tsx`, `.js`, `.mjs` suivis) ; un contrôle à l'échelle du dépôt irait dans `check-repo` (Bilan).
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓ (web).
