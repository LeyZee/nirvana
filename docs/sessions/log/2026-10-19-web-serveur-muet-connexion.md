# 2026-10-19 — Serveur muet au chargement : plus d'écran de connexion à tort — done
Fait : à l'ouverture du CRM, seule une réponse 401 de `/v1/me` mène à l'écran de connexion. Une panne (5xx, proxy de dev sans API, requête qui n'aboutit pas) affiche « Le serveur ne répond pas » en ambre, sans formulaire, et l'app redemande toutes les 30 s jusqu'à ce qu'il réponde (anomalie relevée par la recette sur le PC, `apps/web/src/App.tsx`). Pendant la lecture de la session, un point qui respire au lieu d'une page vide.
Pas fait : rien.
Décisions : même rythme de relecture que le Dashboard (30 s), pas de bouton « Réessayer » (zéro bruit).
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓ (web).
