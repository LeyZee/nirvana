# 2026-10-17 — Politique de vente du corpus (ID proposé) — in_progress
Fait : `offerDecision` (`agent/domain/policy.ts`) ferme l'offre dans plusieurs cas, chacun testé :
- un risque qui interdit la vente ;
- le drapeau « budget nul » ;
- un refus dans la journée de la créatrice ;
- 3 offres dans la journée ;
- 5 offres sans achat.

Gardes bloquantes : `asks_for_nudes`, `contempt`, `payment_lie` ; garde souple : `guilt_trip`. Le cerveau a deux risques de plus, `dangerous_request` et `real_abuse` (prompt 1.5.0), qui passent la main à un humain avant la voix. Deux scénarios adversariaux, L05 et L28. Glossaire et `ai-engine.md` à jour.
Pas fait : brancher `offerDecision` dans le composeur. Il attend les offres, les ventes et le drapeau (P6-01, mémoire du fan), puis la lecture de `strategies.script_launch.cooldown_hours` de la persona.
Décisions : les plafonds du corpus sont des défauts du domaine (3 et 5), à calibrer au playground. Un refus ferme la vente jusqu'au lendemain. Aucune phrase du corpus dans le dépôt.
Découvertes : l'écran Entraîner (`apps/web/src/screens/train/playground/model.ts`) n'a pas les libellés des deux nouveaux risques (fil Extension).
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓ (api : 193).
Relecture à froid : les gardes sont resserrées. Une demande doit viser son corps intime ; le mépris est distingué de la taquinerie (« petit menteur » passe, « sale radin » non) ; « rien à payer pour me parler » est vrai et passe. Après un refus, un achat le même jour rouvre la vente. Un fan qui redemande du payant lève le budget nul, le refus et l'arrêt après 5 offres, mais jamais le plafond du jour. `harassment` et `dispute` ferment aussi la vente. ADR 0019 acceptée par Charles (17/10, 21h54).
Changement de règle (Charles, 17/10 22h00) : les deux compteurs (3 offres par jour, 5 sans achat) sont remplacés par un délai entre deux scripts, 10 h par défaut et réglable par créatrice, et un nouveau script ne part que si le fan sexualise de nouveau. Le budget nul, les risques et les gardes restent. À la demande de Bilan, chaque brouillon porte dans `prompt_hashes` la version du prompt de voix et le modèle qui l'a écrit (`DraftVoice`), pour le taux en réel.
