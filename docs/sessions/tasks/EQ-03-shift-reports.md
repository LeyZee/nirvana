# EQ-03 Rapport de fin de shift dans Nirvana
Statut : todo (lot 3 de l'ADR 0023, ID validé par Charles le 27/10/2026)
Phase : équipe (ADR 0023)
Dépend de : EQ-02
Branche : task/eq-03-shift-reports

## Objectif
Le chatteur déclare à la fin de son shift ce qu'il a généré, directement dans l'application ; un manager le valide ; ces montants nourrissent la paie des comptes en source « déclaré ». Remplace les rapports postés dans Telegram puis lus par un bot dans Imperium.

## Contexte à lire
`docs/adr/0023-team-management.md` (« Une seule source de revenus par compte »), ADR 0011, `docs/design/README.md`.

## À faire
- [ ] Contrats : `ShiftReport` (shift, montant brut en unités mineures et devise du compte, commentaire, incident éventuel), états `submitted` → `validated` | `rejected`, avec auteur et date de chaque transition.
- [ ] Domaine pur : un rapport par shift (idempotence), montant borné, une période verrouillée refuse toute création ou modification, une correction après validation passe par un nouveau rapport d'ajustement lié.
- [ ] Base (via le propriétaire de `packages/db`) : `shift_reports` avec `creator_id` et `member_id`, unicité par shift, `audit_log`. RLS sur les deux : la créatrice **et** (le membre lui-même ou le scope `agency`), sinon deux chatteurs d'une même créatrice liraient leurs montants.
- [ ] Créer ou modifier un rapport prend le verrou consultatif (membre, période) que prend aussi la validation de la paie. Un shift appartient à la période où il commence, dans le fuseau de l'agence.
- [ ] Réglage du compte plateforme : source de revenus `declared` | `detected`, qui ne change qu'à une frontière de période.
- [ ] Écrans : « Faire mon rapport » au bout du shift (trois champs, envoi en un geste), Mes rapports pour le chatteur, Équipe > Rapports pour valider en lot, avec annulation de quelques secondes.

## Critères d'acceptation
- Tests : double envoi du même rapport sans doublon, période verrouillée, ajustement après validation, un compte en « détecté » n'accepte pas de montant déclaré pour cette période, shift commencé le 15 à 23 h rangé dans la première quinzaine.
- Test d'intégration RLS : un chatteur ne lit pas le rapport d'un autre chatteur de la même créatrice.
- Aucune dépendance à Telegram.

## Hors périmètre
Calcul de la paie, ventes détectées par le connecteur.

## Notes de session
