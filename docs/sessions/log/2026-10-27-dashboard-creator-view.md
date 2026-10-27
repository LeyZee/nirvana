# 2026-10-27 — Dashboard : ce que voit une créatrice (ADR 0023) — done

Fait :
- Côté serveur, `GET /v1/dashboard`, lu par une créatrice, renvoie `todos` et `fans` vides, et rien d'autre ne change. Le test d'intégration vérifie qu'aucun prénom de fan n'est dans la réponse.
- À l'écran (`DashboardPage forCreator`, posé par le routeur selon le rôle) :
  - pas de « À traiter » ni de « Voir l'urgence » ;
  - pas de Meilleurs fans ni de lecteur, et donc aucun lien vers Suivi ;
  - pas de bandeau de nuit Telegram ;
  - le mode est en lecture seule (« Le mode de l'agent se change par l'agence. »), puisque `PUT /v1/agent/mode` refuse déjà la créatrice ;
  - la clé manquante devient « L'agence s'en occupe », sans lien vers Réglages.
Ce que la créatrice garde : l'état et le mode de l'agent, sa santé (agrégats), les ventes quand elles seront lues.
Pas fait : rien dans ce fil.
Décisions : la lecture de l'ADR 0023 par le coordinateur (agrégats seulement, aucune urgence nominative). Le contrat ne change pas : les deux listes restent, vides.
Découvertes : la ligne « À poser dans Réglages › Modèles IA » du pli de santé reste visible pour la créatrice. Elle est sans lien, donc sans risque, et partira avec sa PWA (EQ-09).
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓. Le test d'intégration tourne en CI, faute de Docker ici.
