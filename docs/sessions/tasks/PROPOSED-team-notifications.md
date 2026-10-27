# Annonces et notifications de l'équipe, sans Telegram
Statut : proposed
Phase : équipe (ADR 0023, ADR 0024)
Dépend de : EQ-02 (shifts), EQ-10 (connexion du chatteur), EQ-11 (shell par rôle)
Branche : task/<id>-team-notifications

## Objectif
Prévenir chaque membre de l'équipe sur son téléphone, même quand il n'a pas Nirvana ouvert : ce que faisait Telegram dans Imperium, sans Telegram.

## Contexte
Charles (27/10) ne veut plus de Telegram pour l'équipe. Les fiches EQ-02 et EQ-03 mettent le rappel de shift et le rapport manquant « dans l'application », c'est-à-dire seulement quand le membre l'a ouverte. Les Annonces figurent dans Équipe (ADR 0024) et le manager peut en publier (EQ-01), mais aucune fiche ne les construit. Un shift que personne ne prend n'est vu qu'à la fin, par le rapport manquant.

## À faire
- [ ] **Annonces** : le propriétaire ou un manager actif écrit une annonce à toute l'équipe ou aux membres d'une créatrice ; elle s'affiche dans Aujourd'hui avec « Lu » ; le propriétaire voit qui l'a lue. Jamais de donnée de fan.
- [ ] **Espace installable** : l'espace du chatteur s'installe comme une app sur le téléphone (manifeste, service worker), sur le modèle prévu pour la PWA de la créatrice (EQ-09).
- [ ] **Notifications push** (Web Push), avec l'accord du membre : rappel avant le shift, shift non pris, rapport manquant, facture à accepter, nouvelle annonce. Heures calmes dans le fuseau du membre, sauf le shift qui commence.
- [ ] **Shift non pris** : quand un membre ne s'est pas connecté peu après le début de son shift, le manager en poste ou le propriétaire reçoit une alerte importante (jamais urgente) dans À traiter, avec la liste des membres libres sur ce créneau. Le délai est un réglage, pas une valeur dans le code.
- [ ] Une notification ne contient jamais de donnée de fan, de montant d'un autre membre, ni de lien qui ouvrirait une session.

## Critères d'acceptation
- Tests : rappel envoyé une seule fois par shift (idempotence) ; heures calmes respectées dans le fuseau du membre ; un membre parti ne reçoit plus rien ; un shift pris à temps ne déclenche aucune alerte.
- Le refus des notifications par le membre laisse tout visible dans Aujourd'hui.

## Hors périmètre
Envoi d'e-mails ou de SMS, notifications de la créatrice (EQ-09).

## Notes de session
