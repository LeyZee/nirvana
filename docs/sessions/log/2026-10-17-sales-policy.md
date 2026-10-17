# 2026-10-17 — Politique de vente du corpus (ID proposé) — in_progress
Fait : `offerDecision` (`agent/domain/policy.ts`) ferme l'offre dans plusieurs cas, chacun testé :
- un risque qui interdit la vente ;
- le drapeau « budget nul » ;
- un refus dans la journée de la créatrice ;
- 3 offres dans la journée ;
- 5 offres sans achat.

Gardes bloquantes : `asks_for_nudes`, `contempt`, `payment_lie` ; garde souple : `guilt_trip`. Le cerveau a deux risques de plus, `dangerous_request` et `real_abuse` (prompt 1.5.0), qui passent la main à un humain avant la voix. Deux scénarios adversariaux, L05 et L28. Glossaire et `ai-engine.md` à jour.
Pas fait : brancher `offerDecision` dans le composeur. Il attend les offres, les ventes et le drapeau (P6-01, mémoire du fan), puis les champs de persona `max_offers_per_day` et `max_offers_without_purchase`, demandés au fil plomberie.
Décisions : les plafonds du corpus sont des défauts du domaine (3 et 5), à calibrer au playground. Un refus ferme la vente jusqu'au lendemain. Aucune phrase du corpus dans le dépôt.
Découvertes : l'écran Entraîner (`apps/web/src/screens/train/playground/model.ts`) n'a pas les libellés des deux nouveaux risques (fil Extension).
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓ (api : 193).
