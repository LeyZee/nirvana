# Rapport de fin de shift dans Nirvana (ID à proposer)
Statut : proposed (lot 3 de l'ADR 0023, ID à valider par Charles)
Phase : équipe (ADR 0023)
Dépend de : fiche Planning (`PROPOSED-shift-planning.md`)
Branche : task/<id>-shift-reports

## Objectif
Le chatteur déclare à la fin de son shift ce qu'il a généré, directement dans l'application ; un manager le valide ; ces montants nourrissent la paie des comptes en source « déclaré ». Remplace les rapports postés dans Telegram puis lus par un bot dans Imperium.

## Contexte à lire
`docs/adr/0023-team-management.md` (« Une seule source de revenus par compte »), ADR 0011, `docs/design/README.md`.

## À faire
- [ ] Contrats : `ShiftReport` (shift, montant brut en unités mineures et devise du compte, commentaire, incident éventuel), états `submitted` → `validated` | `rejected`, avec auteur et date de chaque transition.
- [ ] Domaine pur : un rapport par shift (idempotence), montant borné, une période verrouillée refuse toute création ou modification, une correction après validation passe par un nouveau rapport d'ajustement lié.
- [ ] Base (via le propriétaire de `packages/db`) : `shift_reports` avec `creator_id`, unicité par shift, `audit_log`.
- [ ] Réglage du compte plateforme : source de revenus `declared` | `detected`, qui ne change qu'à une frontière de période.
- [ ] Écrans : « Faire mon rapport » au bout du shift (trois champs, envoi en un geste), Mes rapports pour le chatteur, Équipe > Rapports pour valider en lot, avec annulation de quelques secondes.

## Critères d'acceptation
- Tests : double envoi du même rapport sans doublon, période verrouillée, ajustement après validation, un compte en « détecté » n'accepte pas de montant déclaré pour cette période.
- Aucune dépendance à Telegram.

## Hors périmètre
Calcul de la paie, ventes détectées par le connecteur.

## Notes de session
