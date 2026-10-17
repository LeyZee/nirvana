# 2026-10-17 — Gardes de sortie, relances et plafond (revue 09, G5, G11, G12, G9) — in_progress
Fait :
- **Gardes, G5.** Le verrou de sortie lit aussi le message entier, normalisé puis démasqué. Il ramène les lettres cyrilliques et grecques à leur sosie latin, cherche l'aveu d'IA et l'amour en anglais et en espagnol (« chui une IA », « jtaime »). Il repère un numéro coupé entre bulles, un numéro en lettres et un email « at … dot com ».
- **Relances, G11.** L'attente avant chaque relance croît, ou suit `retry-after`. Une attente demandée de plus de 10 s passe au modèle de repli.
- **Plafond, G12.** Un appel au coût inconnu compte 0,05 $. Le dépassement de quelques centimes en concurrence est documenté et accepté.
- **Politique, G9.** `offerableScripts` écarte pour toujours un script refusé.
- **Relecture à froid.** Un compte à rebours (« dix, neuf, huit… ») et « oh oh oh » ne passent plus pour un numéro ; « ma chatte point ça » ne passe plus pour un email. Fermés aussi : l'IA à la troisième personne, ChatGPT et les autres marques, « A.I. », les petites capitales, « une lA », un mot coupé entre bulles, un numéro avec virgules, barres, emoji ou chiffres et lettres mêlés, les nombres belges et suisses, l'email « @ » espacé, les mots interdits coupés ou masqués. Une erreur 5xx ne compte plus dans le plafond ; `retry-after` vide est ignoré et lu aussi sur un 5xx.
Pas fait :
- G5, bulles retouchées : `startBubbleGuard` (gardes dures, bulle par bulle et message entier) est prêt pour le port `BubbleGuard` de Bilan, qui refuse l'approbation en 422 ; branchement par Bilan.
- G9 : brancher `offerDecision` attend les offres, les ventes et les refus (P6-01).
- G12 : ids `llm_calls` en uuid v7 chez Bilan (`llm-call-store.ts`) ; coûts du journal en entiers (ADR 0011), PR suivante.
- B2, vision sur tout message avec média : attend les médias dans `HistoryMessage` (Bilan).
Décisions : aucune nouvelle ; seuils de relance et d'estimation dans le code.
Découvertes : les gardes restent des listes de motifs ; un juge de sortie (petit modèle) relirait ce qu'elles ne voient pas, à décider avec l'évaluation (évals).
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓ (api 239, llm 50).
