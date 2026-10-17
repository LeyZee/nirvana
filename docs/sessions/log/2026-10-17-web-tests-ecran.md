# 2026-10-17 — Tests d'écran d'apps/web (revue 09, G15) — done
Fait : couche « écran web » dans `docs/conventions/testing.md` (Vitest + jsdom + Testing Library, `fetch` remplacé par un faux serveur). Tests du contrôle de l'agent (Automatique verrouillé et ce qui manque, ouvert quand le serveur le dit, Arrêt confirmé, Annuler et Échap, flèches), de la pastille de la barre (lien vers le Dashboard, suit un changement fait ailleurs, refuse un Automatique fermé), de Suivi (aucune créatrice, serveur muet puis « Réessayer », liste triée avec état et non lus, créatrice nommée sur chaque ligne s'il y en a plusieurs) et du Dashboard (exemple, arrêt puis reprise en un clic). Correctif : un Arrêt choisi avant la première lecture du mode était écrasé par cette lecture, sans rien dire ; `useAgentMode` annule la lecture en cours avant de changer de mode (test qui le reproduit).
Pas fait : écrans Persona, Services, Telegram et Playground (leurs fils) ; extension au-delà du titre du popup (G15, côté Extension, PR à part) ; cas de focus après la fenêtre d'arrêt, à ajouter quand #73 sera dans main.
Décisions : jsdom 29.1.1 et non 30, qui exige Node 22.22.2 alors que le dépôt est sur 22.22.0 (`.nvmrc`).
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓ (88 web), pnpm audit identique à main.
