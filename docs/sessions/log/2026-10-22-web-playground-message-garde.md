# 2026-10-22 — Playground : le message reste quand l'envoi échoue (recette R-G12) — done
Fait : le compositeur du Playground n'efface le message tapé (et le média décrit) qu'une fois l'envoi réussi ; si le serveur ne répond pas, le texte reste dans le champ, prêt à repartir. `onSend` rend désormais une promesse de booléen, du Playground jusqu'au compositeur. Tests : envoi raté, le texte reste ; envoi réussi, le champ se vide.
Pas fait : en-tête « Voix · modèle » et coût de session en euros, qui attendent `voice.reachable` et `sessionCostEur` (PR « santé » de Bilan).
Décisions : aucune.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓ (web).
