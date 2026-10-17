# 2026-10-17 — Modèle injoignable : la main passe à un humain — done
Fait : G1 de la revue à froid. Avant, une panne de modèle (fournisseur en panne, clé absente, exception du composeur) donnait `reply_skipped` et remettait la conversation en `idle` : le fan restait sans réponse et personne n'était prévenu. Maintenant c'est un `handoff_requested` de cause `llm_unavailable` (nouvelle valeur de `HANDOFF_CAUSES`) : la conversation passe à `human`, le bot n'écrit plus à ce fan et Telegram envoie une alerte « Important » : « Le modèle ne répond plus. Il n’écrit plus à ce fan et attend un humain. » Docs : message-flow §2, data-model, ADR 0020.
Pas fait : rien.
Décisions : le texte validé par le fil Telegram est raccourci à « Le modèle ne répond plus. », parce que la phrase commune à toutes les causes dit déjà « attend un humain ». `reply_skipped` garde la raison `llm_unavailable` dans son schéma pour que les anciens journaux restent lisibles ; plus rien ne la produit.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test:all ✓.
