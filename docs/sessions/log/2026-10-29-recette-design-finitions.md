# 2026-10-29 — Recette design, finitions (dates, compteurs, créatrices) — done

Fait :
- PAIE-19 : le premier du mois s'écrit « 1er » partout, aussi dans `dayMonth` (« dim. 1er nov. ») et dans le libellé de la semaine (« 26 oct. – 1er nov. »), par `withFirstOfMonth`, comme `longDay`.
- PAIE-09 : le compteur d'un onglet (`nv-subnav__count`) est un nombre en encre sur verre, jamais une pastille néon ; le néon reste au bouton de l'écran. La prop `quiet` disparaît, tous les compteurs ont ce ton.
- CREA-30 : la liste des créatrices ne réessaie qu'une fois, après 400 ms ; « Le serveur ne répond pas » arrive en moins de deux secondes (les heures le faisaient déjà).
- CREA-27 : le fuseau d'une créatrice se choisit par ville (« Paris », « Montréal ») dans une liste, les villes courantes de l'agence d'abord, le fuseau gardé derrière ; à la création comme au changement de fuseau. Le texte d'un fuseau refusé dit « Choisis une ville dans la liste ».
Déjà faits, vérifiés : PAIE-16 (fondu et défilement jusqu'à l'onglet actif au téléphone), DASH-22 à 25 (#316).
Décisions : Montréal garde le fuseau de Toronto, le seul que la liste du navigateur connaît pour cette heure ; un fuseau déjà posé hors de la liste reste proposé tel quel.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, tests web ✓ (« 1er » dans les deux formats, compteur neutre, ville et fuseau derrière, fuseau refusé).
