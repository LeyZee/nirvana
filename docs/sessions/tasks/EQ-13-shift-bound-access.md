# EQ-13 Accès d'un chatteur borné à son shift
Statut : todo (ID validé par Charles le 27/10/2026, 15h11 : « je les veux tous »)
Phase : équipe (ADR 0023, ADR 0024)
Dépend de : EQ-01, EQ-02 (`onShift`), le filtre des conversations routées (prérequis d'EQ-08 et d'EQ-10), EQ-08 pour le Suivi du chatteur
Branche : task/eq-13-shift-bound-access

## Objectif
Un chatteur ne lit les fans et les conversations de ses créatrices que pendant son shift, plus une courte marge, pour qu'un chatteur qui s'en va ne parte pas avec la liste des gros fans.

## Contexte à lire
`docs/adr/0024-roles-and-navigation.md` (§ Rôles et scopes), `docs/architecture/threat-model.md`, `docs/conventions/security.md`, EQ-02, EQ-08, EQ-10. Aujourd'hui, un `operator` lit tout ce que `creator_ids` lui ouvre, à toute heure. Dans une agence, le départ d'un chatteur avec les fans de ses créatrices est le risque le plus coûteux. Le filtre du serveur prévu en prérequis d'EQ-08 et d'EQ-10 limite un chatteur aux conversations qui lui sont routées ; la fiche du fan, sa mémoire et la liste des fans restent ouvertes, à toute heure.

## À faire
- [ ] Décision à écrire avant de coder, en ADR si elle change la façon dont la base filtre : une politique RLS de plus (la base refuse) ou une garde du serveur. Si la base, la migration passe par le propriétaire de `packages/db`.
- [ ] Règle dans le code, testée : un chatteur (`team_role = chatter`, scope `self`) lit fans, conversations et passations d'une créatrice seulement si `onShift` le place sur elle, avec une marge avant et après réglée par le propriétaire. Un manager actif et le propriétaire ne sont pas bornés. L'accès suit le shift prévu, pas la prise de poste (EQ-12) : un oubli de prise de poste ne bloque pas un chatteur.
- [ ] Une passation en cours reste lisible par son preneur jusqu'à ce qu'il la rende, même après la fin du shift.
- [ ] Hors shift, le chatteur garde Aujourd'hui, Planning, Commissions et Moi ; Suivi affiche un état honnête (« Tu n'es pas en poste »), jamais une erreur.
- [ ] Aucun export de liste de fans pour un chatteur ; chaque lecture d'une fiche de fan par un chatteur entre au journal (`audit_log`), sans le contenu de la fiche.

## Critères d'acceptation
- Tests d'intégration : hors shift, un chatteur ne lit ni fan ni conversation de sa créatrice ; pendant son shift, il les lit ; dans la marge, il les lit encore ; une passation prise reste lisible jusqu'à « Rendre la main » ; le manager actif n'est pas borné ; un shift de nuit à cheval sur minuit ouvre l'accès sur toute sa durée.
- Un changement de planning (shift retiré) ferme l'accès sans attendre une nouvelle connexion.

## Hors périmètre
Filigrane, détection de copie d'écran.

## Notes de session
