# 2026-10-22 — Dashboard : chaque ligne de « À traiter » ouvre Suivi — done

Fait : chaque ligne de « À traiter » du serveur ouvre Suivi sur sa conversation (`/suivi?conversation=…`), le bouton « Voir l'urgence » compris. C'est là qu'on valide un brouillon et qu'on rend la main à l'agent après une reprise (suggestion d'Extension sur #116). Le Dashboard n'ajoute plus aux Meilleurs fans les fans qui attendent sans avoir rien dépensé ; il ne servait qu'à ouvrir leur lecteur. Le lecteur des Meilleurs fans dit maintenant « Le fil de la conversation se lit dans Suivi ou dans Reveal. ». Les lignes de l'exemple ouvrent toujours le lecteur.
Pas fait : la part agent des Meilleurs fans sur `--nv-data-1` (A-11), qui attend la refonte (#105).
Décisions : aucune.
Découvertes : `DashboardFan` ne porte pas de `conversationId`. Un fan des Meilleurs fans ne peut donc pas ouvrir Suivi directement : il faudrait que Bilan ajoute ce champ au contrat.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓.
