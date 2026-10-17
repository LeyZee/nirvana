# 2026-10-17 — Gardes de sortie, relances et plafond (revue 09, G5, G11, G12, G9) — in_progress
Fait :
- **Gardes, G5.** Le verrou de sortie lit aussi le message entier, normalisé puis démasqué. Il ramène les lettres cyrilliques et grecques à leur sosie latin, cherche l'aveu d'IA et l'amour en anglais et en espagnol (« chui une IA », « jtaime »). Il repère un numéro coupé entre bulles, un numéro en lettres et un email « at … dot com ».
- **Relances, G11.** L'attente avant chaque relance croît, ou suit `retry-after`. Une attente demandée de plus de 10 s passe au modèle de repli.
- **Plafond, G12.** Un appel au coût inconnu compte 0,05 $. Le dépassement de quelques centimes en concurrence est documenté et accepté.
- **Politique, G9.** `offerableScripts` écarte pour toujours un script refusé.
Pas fait :
- G5, bulles retouchées par un humain : relèvent de Bilan (approve).
- G9 : brancher `offerDecision` attend les offres, les ventes et les refus (P6-01).
- G12 : coûts en entiers et ids `llm_calls` en uuid v7, dans `llm-call-store.ts`, à voir avec Bilan.
- B2, vision sur tout message avec média : attend les médias dans `HistoryMessage` (Bilan).
Décisions : aucune nouvelle ; seuils de relance et d'estimation dans le code.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓ (api 203, llm 50).
