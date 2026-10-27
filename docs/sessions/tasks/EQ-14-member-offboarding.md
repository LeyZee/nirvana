# EQ-14 Départ d'un membre : accès, conversations, dernier versement
Statut : todo (ID validé par Charles le 27/10/2026, 15h11 : « je les veux tous »)
Phase : équipe (ADR 0023, ADR 0024)
Dépend de : EQ-01 (statut parti), EQ-02 (planning), EQ-04 et EQ-05 (paie), EQ-06 (factures) ; la remise des passations se branche sur EQ-08 quand elle existe
Branche : task/eq-14-member-offboarding

## Objectif
Le départ d'un chatteur ou d'un manager se fait en un seul parcours, sans oubli : accès coupé à la bonne heure, planning libéré, conversations rendues, dernier relevé et dernière facture faits, puis plus rien d'ouvert.

## Contexte à lire
`docs/adr/0023-team-management.md` (§ Paie, § Factures), EQ-01 (« marquer parti » : `creator_ids` vidé et sessions révoquées dans la même transaction), EQ-02, EQ-04 (minimum de versement, report), EQ-06 (acceptation tacite, conservation dix ans), EQ-08 (« Rendre la main »), EQ-12. Imperium coupait l'accès, mais un report sous le minimum restait en attente sans fin et la dernière facture se faisait à la main.

## À faire
- [ ] **Départ** (`offboarding`) lancé depuis la fiche du membre par le propriétaire (un manager actif peut le préparer, pas le valider) : date et heure de fin, motif interne (note datée, jamais visible du membre), aperçu de tout ce qui va se passer avant de confirmer.
- [ ] **À l'heure de fin**, dans une transaction et par un job rejouable : statut `left`, `creator_ids` vidé, sessions révoquées (EQ-01) ; shifts futurs retirés et modèles récurrents arrêtés, chaque créneau libéré signalé « à pourvoir » au manager (alerte d'EQ-12) ; passations en cours rendues comme un « Rendre la main » sans issue (`none`), avec la note « Départ du chatteur », puis routées comme d'habitude.
- [ ] **Dernier versement** : le relevé de sa dernière période est marqué final ; le moteur (EQ-04) n'y applique pas le minimum de versement, et tout report en attente y est versé. Règle dans le domaine, testée.
- [ ] **Espace de départ** : après l'heure de fin, le membre peut encore se connecter, mais il ne voit que Commissions et Moi : ses relevés, sa dernière facture à accepter ou contester, son dossier. Cet espace se ferme quand sa dernière facture est payée et que le délai de contestation est passé ; ensuite, connexion refusée avec un message clair.
- [ ] **Conservation** : factures, avoirs, relevés et dossier prestataire gardés dix ans (EQ-06) ; la photo, les abonnements push et les préférences du membre sont effacés à la fermeture de l'espace de départ. Rien d'autre n'est supprimé.
- [ ] **Retour** : un membre parti qui revient est repassé actif par le propriétaire et reçoit un nouveau lien d'invitation (EQ-10) ; son historique et sa séquence de factures continuent.
- [ ] `audit_log` pour le départ, chaque étape du job et la fermeture de l'espace.
- [ ] Écran, à la place que fixe l'ADR 0024 (fiche du membre dans Équipe) : le parcours de départ en un panneau, avec son aperçu ; design system, aucune durée en dur.

## Critères d'acceptation
- Tests : à l'heure de fin, le membre ne lit plus aucun fan ni conversation, même avec une session ouverte juste avant ; ses shifts futurs disparaissent et une seule alerte « à pourvoir » part par créneau ; une passation prise est rendue à l'agent ; un report sous le minimum est versé dans le relevé final ; le job rejoué ne fait rien de plus.
- Test d'intégration RLS : dans l'espace de départ, le membre lit ses relevés et ses factures, rien d'autre ; après sa fermeture, il ne lit plus rien.
- Aucun vrai prénom ni montant réel dans les tests (ADR 0010).

## Hors périmètre
Coordonnées de paiement, solde des litiges hors de l'application, suppression des données sur demande du membre (à traiter avec le comptable, plus tard).

## Notes de session
