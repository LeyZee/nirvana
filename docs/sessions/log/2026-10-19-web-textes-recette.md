# 2026-10-19 — Textes du CRM relevés par la recette — done
Fait : apostrophes typographiques dans Réglages (mode de l'agent, appareils) et Entraîner › Tests ; ce que le fan a dépensé s'écrit en euros dans le Playground, comme sur Reveal et le Dashboard (le coût de la session reste en dollars jusqu'à ce que l'API le donne en euros) ; « Réessaie dans un quart d'heure » après trop de tentatives de connexion (la fenêtre dure 15 min) ; la persona en panne ne dit plus « Vérifie ta connexion » ; « Messa » écrit en dur remplacé par « la créatrice » (Tests, Modèles IA › Services) ; commentaire périmé de `useAgentMode.ts`. Le Réglages › Mode ne cite plus les seuils de l'automatique (le Dashboard dit ce qui manque, chiffres du serveur à l'appui). Au démarrage, l'app redemande la session après 3 s, puis 10 s, puis toutes les 30 s (suggestion de la relecture de #99).
Pas fait : coût de session en euros et état de la clé de la voix dans l'en-tête du Playground, qui attendent `sessionCostEur` et `voice.reachable` (PR « santé » de Bilan).
Décisions : aucune.
Découvertes : le prompt de situation dit encore « Il a déjà dépensé … $ » (`apps/api/src/modules/agent/domain/situation.ts:89`, fil agent, transmis au coordinateur).
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓ (web).
