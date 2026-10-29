# EQ-14 Départ d'un membre : accès, conversations, dernier versement
Statut : todo (ID validé par Charles le 27/10/2026, 15h11 : « je les veux tous »)
Phase : équipe (ADR 0023, ADR 0024)
Dépend de : EQ-01 (statut parti), EQ-02 (planning), EQ-04 et EQ-05 (paie), EQ-06 (factures) ; la remise des passations se branche sur EQ-08 quand elle existe
Branche : task/eq-14-member-offboarding

## Objectif
Le départ d'un chatteur ou d'un manager se fait en un seul parcours, sans oubli : accès à Nirvana coupé à la bonne heure, accès à Reveal retiré par le propriétaire avec un rappel, planning libéré, conversations rendues, dernier relevé et dernière facture faits, puis plus rien d'ouvert.

## Contexte à lire
`docs/adr/0023-team-management.md` (§ Paie, § Factures), EQ-01 (« marquer parti » : `creator_ids` vidé et sessions révoquées dans la même transaction), EQ-02, EQ-04 (minimum de versement, report), EQ-06 (acceptation tacite, conservation dix ans), EQ-08 (« Rendre la main »), EQ-12. Imperium coupait l'accès, mais un report sous le minimum restait en attente sans fin et la dernière facture se faisait à la main.

## À faire
- [ ] **Départ** (`offboarding`) lancé depuis la fiche du membre par le propriétaire (un manager actif peut le préparer, pas le valider) : date et heure de fin, motif interne (note datée, jamais visible du membre), aperçu de tout ce qui va se passer avant de confirmer.
- [ ] **À l'heure de fin**, dans une transaction et par un job rejouable : statut `left`, `creator_ids` vidé, sessions révoquées (EQ-01) ; shifts futurs retirés et modèles récurrents arrêtés, chaque créneau libéré signalé « à pourvoir » au manager (alerte d'EQ-12) ; passations en cours rendues comme un « Rendre la main » sans issue (`none`), avec la note « Départ du chatteur », puis routées comme d'habitude.
- [ ] **Côté Reveal**, que Nirvana ne peut pas faire seul (ADR 0025) : le parcours rappelle au propriétaire de retirer le compte membre Reveal du chatteur, et attend sa coche « Accès Reveal retiré », datée et notée au journal ; tant qu'elle manque, le départ reste signalé en ambre dans Équipe.
- [ ] **Dernier versement** : le relevé de sa dernière période est marqué final ; le moteur (EQ-04) n'y applique pas le minimum de versement, et tout report en attente y est versé. Règle dans le domaine, testée.
- [ ] **Espace de départ**, règle écrite ici et seulement ici (EQ-01 et EQ-10 y renvoient) : à l'heure de fin, toutes les sessions du membre sont révoquées ; une nouvelle connexion reste permise tant que l'espace de départ est ouvert, et le serveur n'ouvre alors qu'une liste de routes décidée dans le code, pas à l'écran : ses relevés, sa dernière facture à accepter ou contester, son dossier (Commissions et Moi). L'espace se ferme quand sa dernière facture est payée et que le délai de contestation est passé ; ensuite, connexion refusée avec un message clair. Note du 28/10 : depuis le choix de Charles du 28/10, un membre `left` ne se connecte plus du tout (`databaseHooks.session.create.before` et `userOf` dans `apps/api/src/auth.ts`). L'espace de départ devra rouvrir ce refus pour ses seules routes, et Charles devra trancher entre ce refus et cet espace.
- [ ] **Conservation** : factures, avoirs, relevés et dossier prestataire gardés dix ans (EQ-06) ; la photo, les abonnements push et les préférences du membre sont effacés à la fermeture de l'espace de départ. Rien d'autre n'est supprimé.
- [ ] **Retour** : un membre parti qui revient est repassé actif par le propriétaire et reçoit un nouveau lien d'invitation (EQ-10) ; son historique et sa séquence de factures continuent.
- [ ] `audit_log` pour le départ, chaque étape du job et la fermeture de l'espace.
- [ ] Écran, à la place que fixe l'ADR 0024 (fiche du membre dans Équipe) : le parcours de départ en un panneau, avec son aperçu ; design system, aucune durée en dur.

## Critères d'acceptation
- Tests : à l'heure de fin, le membre ne lit plus aucun fan ni conversation, même avec une session ouverte juste avant ; ses shifts futurs disparaissent et une seule alerte « à pourvoir » part par créneau ; une passation prise est rendue à l'agent ; un report sous le minimum est versé dans le relevé final ; le job rejoué ne fait rien de plus.
- Tests d'intégration : à l'heure de fin, la session ouverte juste avant ne lit plus rien ; une nouvelle connexion dans l'espace de départ lit ses relevés, ses factures et son dossier, et reçoit 403 sur toute autre route ; après la fermeture, la connexion est refusée.
- Aucun vrai prénom ni montant réel dans les tests (ADR 0010).
- Finition (Charles, 27/10, 15h22 : « que ce soit vraiment très joli… des hovers partout… une belle hiérarchie des informations ») : chaque écran passe la barre de `docs/design/README.md` § Finition d'un écran, preuves comprises (captures Nuit et Jour, bureau et téléphone, mouvement réduit).

## Hors périmètre
Coordonnées de paiement, solde des litiges hors de l'application, suppression des données sur demande du membre (à traiter avec le comptable, plus tard).

## Notes de session
