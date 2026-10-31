# 2026-10-31 — ADR 0038 proposée : le report borné pour payer chaque facture avant son échéance (fil Équipe) — done
Fait :
- `docs/adr/0038-bounded-carry-over-before-due-date.md` (proposée) et sa ligne dans l'index : échéance à l'émission plus 60 jours par défaut (réglage de 45 à 60), un total positif sous le minimum reporté deux fois au plus et versé à la troisième quinzaine, un cumul nul ou négatif ne verse rien et remet le compte à zéro, un report repris d'Imperium versé par la première quinzaine de Nirvana, alertes d'échéance J-7 et dépassée au lot 8.
Pas fait : le moteur de paie, la base et le glossaire, qui attendent « ok 0038 » de Charles (PR à part, fil Équipe).
Décisions : avis de comptable demandé par Charles le 31/10 ; le plafond de 60 jours et les conditions de paiement figées sur chaque facture sont dans #328 (EQ-06 lot 3), seul le report borné change une règle d'Imperium et passe par cette ADR.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : `pnpm exec prettier --check` et `node scripts/check-repo.mjs` sur les fichiers touchés.
