# 2026-10-17 — Dashboard : focus après la confirmation d'arrêt — done

Fait : la fenêtre « Arrêter l'agent ? » rend le focus au contrôle du mode quand elle se ferme, sur l'option cochée à partir de là (Copilote si on annule, Arrêt si on confirme), comme le veut un groupe radio. Avant, Échap ou « Annuler » laissait le focus sur `body` (défaut de #55, relevé à la relecture de #67). L'effet d'ouverture ne se relance plus quand la page se redessine pendant que la fenêtre est ouverte.
Pas fait : rien.
Décisions : aucune.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓, au clavier et à la souris dans Chromium (Échap, Annuler, confirmation, redessin pendant l'ouverture).
