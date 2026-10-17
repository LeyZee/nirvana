# 2026-10-17 — Persona : genre déprécié — done
Fait : `details.gender` devient facultatif et ignoré (Charles, 17/10 22h11 : Nirvana est fait pour des créatrices). Les fichiers persona existants, qui le portent, restent valides. Référence du schéma mise à jour.
Pas fait : retrait du champ de l'écran Persona (fil Persona) ; suppression définitive, à faire avec une version de schéma suivante.
Décisions : dépréciation plutôt que suppression, pour ne pas casser la v0.0.0.
Découvertes : `languages` est déjà une liste (au moins une, sans doublon) : rien à changer pour le choix multiple.
Candidats à suppression : `gender` et `GENDERS`, à la prochaine version de schéma.
Vérifié : pnpm check ✓, tests contracts ✓.
