# Accès d'un chatteur borné à son shift
Statut : proposed
Phase : équipe (ADR 0023, ADR 0024)
Dépend de : EQ-01, EQ-02 (`onShift`), EQ-08 pour le Suivi du chatteur
Branche : task/<id>-shift-bound-access

## Objectif
Un chatteur ne lit les fans et les conversations de ses créatrices que pendant son shift, plus une courte marge, pour qu'un chatteur qui s'en va ne parte pas avec la liste des gros fans.

## Contexte
Aujourd'hui, un `operator` lit tout ce que `creator_ids` lui ouvre, à toute heure. Dans une agence, le départ d'un chatteur avec les fans de ses créatrices est le risque le plus coûteux. Le Suivi du chatteur ne montre déjà que les passations `sale` qui lui sont routées (ADR 0024) ; la fiche du fan, sa mémoire et la liste des fans restent ouvertes.

## À faire
- [ ] Règle dans le code, testée : un chatteur (`team_role = chatter`, scope `self`) lit fans, conversations et passations d'une créatrice seulement si `onShift` le place sur elle, avec une marge avant et après réglée par le propriétaire. Un manager actif et le propriétaire ne sont pas bornés.
- [ ] Une passation en cours reste lisible par son preneur jusqu'à ce qu'il la rende, même après la fin du shift.
- [ ] Aucun export de liste de fans pour un chatteur ; chaque lecture d'une fiche de fan par un chatteur entre au journal.
- [ ] Décision à écrire avant de coder : faut-il une politique RLS de plus (la base refuse) ou une garde du serveur suffit-elle ? Si la base, la migration passe par le propriétaire de `packages/db`.

## Critères d'acceptation
- Tests d'intégration : hors shift, un chatteur ne lit ni fan ni conversation de sa créatrice ; pendant son shift, il les lit ; une passation prise reste lisible jusqu'à « Rendre la main » ; le manager actif n'est pas borné.

## Hors périmètre
Filigrane, détection de copie d'écran.

## Notes de session
