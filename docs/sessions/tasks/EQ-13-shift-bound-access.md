# EQ-13 Accès d'un chatteur borné à son shift
Statut : todo (ID validé par Charles le 27/10/2026, 15h11 : « je les veux tous » ; ADR 0025 acceptée le même jour à 15h28)
Phase : équipe (ADR 0023, ADR 0024, ADR 0025)
Dépend de : ADR 0025, EQ-01, EQ-02 (`onShift`), le filtre des conversations routées (prérequis d'EQ-08 et d'EQ-10), EQ-08 pour les passations `sale`
Branche : task/eq-13-shift-bound-access

## Objectif
Pendant son shift et une courte marge, Nirvana montre au chatteur toutes les conversations des créatrices que son shift couvre (il y valide les brouillons de l'agent et y prend ses passations, puis vend dans Reveal) ; hors de cette fenêtre, Nirvana ne lui montre rien, pour qu'un chatteur qui s'en va ne parte pas avec la mémoire des gros fans.

## Contexte à lire
`docs/adr/0025-chatter-access-during-shift.md` en entier, ADR 0024 (§ Rôles et scopes), `docs/architecture/threat-model.md`, `docs/conventions/security.md`, EQ-02, EQ-08, EQ-10. Le filtre du serveur livré avant EQ-08 et EQ-10 ferme tout par défaut : pour un membre au scope `self`, `currentUser()` vide `creatorIds`, et le chatteur ne lit que les conversations routées vers lui (`conversations.routed_to_user_id`). Cette fiche est celle qui **ouvre**, pendant le shift seulement. Elle borne ce que Nirvana montre, pas Reveal : Nirvana ne ferme pas la session Reveal d'un chatteur (ADR 0025, § Ce que Nirvana ne peut pas faire côté Reveal).

## À faire
- [ ] Garde du serveur (ADR 0025), calculée à chaque requête comme `creatorIds` : pendant un shift (`onShift`) et une marge avant et après réglée par le propriétaire, un chatteur reçoit les créatrices que ce shift couvre dans un ensemble à part de `CurrentUser` (à côté de `routedCreatorIds`, contrat par le propriétaire de `packages/contracts`), jamais dans `creatorIds`, qui ouvrirait aussi le mode, le Dashboard, la persona et la liste des fans. Il lit leur file À traiter, leurs conversations, et pour celles-ci la fiche du fan et sa mémoire ; il valide, retouche ou refuse un brouillon de l'agent, prend une passation, ouvre la conversation dans Reveal par le lien du brief, et rend la main. Aucun champ libre pour écrire à un fan. Jamais le mode de l'agent, la persona, Entraîner ni les Réglages.
- [ ] L'accès suit le shift prévu, pas la prise de poste (EQ-12) : un oubli de prise de poste ne bloque pas un chatteur.
- [ ] Une passation qu'il a prise reste lisible par lui seul jusqu'à « Rendre la main », même après la fin de la fenêtre.
- [ ] Ses passations routées passent en tête de sa file (EQ-08).
- [ ] Hors fenêtre, le chatteur garde Aujourd'hui, Planning, Commissions et Moi ; Suivi affiche un état honnête (« Tu n'es pas en poste »), jamais une erreur.
- [ ] Aucun export de liste de fans pour un chatteur ; chaque lecture d'une fiche de fan par un chatteur entre au journal (`audit_log`), sans le contenu de la fiche.
- [ ] Index sur les shifts d'un membre pour que la garde reste rapide à chaque requête (migration par le propriétaire de `packages/db` si besoin).

## Critères d'acceptation
- Tests d'intégration : hors fenêtre, un chatteur ne lit ni fan ni conversation de sa créatrice ; pendant son shift et dans la marge, il les lit et peut valider un brouillon ; il ne lit jamais une créatrice que son shift ne couvre pas ; une passation prise reste lisible jusqu'à « Rendre la main » ; le manager actif n'est pas borné ; un manager non actif l'est ; un shift de nuit à cheval sur minuit ouvre l'accès sur toute sa durée.
- Un shift retiré ou raccourci ferme l'accès à la requête suivante, sans attendre une nouvelle connexion.
- Pendant son shift, le chatteur reçoit toujours 403 sur le mode de l'agent, le Dashboard, la persona et la liste des fans de la créatrice.
- Finition (Charles, 27/10, 15h22 : « que ce soit vraiment très joli… des hovers partout… une belle hiérarchie des informations ») : chaque écran passe la barre de `docs/design/README.md` § Finition d'un écran, preuves comprises (captures Nuit et Jour, bureau et téléphone, mouvement réduit).

## Hors périmètre
Filigrane, détection de copie d'écran, changement du mode de l'agent par un chatteur.

## Notes de session
