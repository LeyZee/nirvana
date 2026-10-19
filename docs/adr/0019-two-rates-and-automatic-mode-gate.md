# 0019. Deux taux, et la règle qui ouvre le mode Automatique

Statut : accepted (Charles, 17/10 21h54)
Date : 2026-10-17

## Contexte

Le bot se mesure à deux endroits. Dans le playground, Charles et Messa notent des réponses à des fans fictifs (P3-05). Avec les vrais fans, chaque brouillon attend un chatteur, qui l'approuve tel quel, le modifie ou le rejette (P3-06). Un seul nom, « taux de validation », désignait les deux, alors qu'ils ne mesurent pas la même chose : au playground, c'est l'entraîneur qui choisit les situations, et il les connaît. Charles a fixé le juge final : le mode Automatique ne s'ouvre qu'à 80 % « en réel », et après un test à l'aveugle avec Messa (revue 08, 17/10 20h18). Le bouton est unique : Automatique, Copilote ou Arrêt.

## Décision

- **Taux au playground** (`playgroundRate`) : la part des réponses validées sans retouche parmi les 50 dernières notées au playground, pour une version de la voix (prompt et modèle). Il sert à calibrer et à comparer des versions. Il **n'ouvre jamais** le mode Automatique.
- **Taux en réel** (`liveRate`) : la part des brouillons approuvés sans modification par un chatteur parmi les 200 derniers brouillons décidés, par créatrice et par version de la voix. Un brouillon compte comme décidé quand il est approuvé (tel quel ou modifié) ou rejeté. Un brouillon retenu (relais humain, plafond du jour, garde bloquante, rien à répondre) ou expiré sans qu'on l'ait regardé ne compte pas : il ne mesure pas la voix.
- **Le mode Automatique s'ouvre** pour une créatrice si, et seulement si :
  1. le taux en réel de la version active atteint au moins 80 % ;
  2. sur au moins 100 brouillons décidés de cette version ;
  3. et le test à l'aveugle avec la créatrice est validé pour cette version, enregistré par le propriétaire avec la date et le taux « sans retouche » obtenu (au moins 80 %).
  
  Sinon, le bouton Automatique reste verrouillé et dit ce qui manque.
- **Retour en copilote, sans demander** : quand le taux en réel passe sous 80 % sur la fenêtre, ou quand la version de la voix change. La nouvelle version doit refaire ses 100 brouillons. Un événement prévient le propriétaire.
- Les seuils (80 %, 100, 200, 50) sont des constantes du code, pas des réglages du prompt. La règle est appliquée par le serveur ; l'écran ne fait que l'afficher.

## Conséquences

- L'écran Entraîner affiche le taux au playground sous ce nom, et le Dashboard, le taux en réel. Les deux ne sont jamais additionnés.
- Le taux en réel demande de garder, pour chaque brouillon décidé, la version de la voix qui l'a écrit, et de distinguer « approuvé tel quel » d'« approuvé modifié ».
- Le test à l'aveugle devient une donnée : version, date, taux, enregistré par le propriétaire.
- Changer de prompt ou de modèle de voix coûte un retour en copilote : c'est voulu.

## Mise en œuvre (19/10, revue 09 B3)

- Le verrou est lu à un seul endroit, le module `conversations`, avec la règle de `packages/contracts/src/automatic.ts` ; le Dashboard affiche cette lecture. Détail : `docs/architecture/message-flow.md` §6.
- Le test à l'aveugle est la table `blind_tests` (append-only), enregistrée par le propriétaire avec une connexion de moins de 10 minutes ; le dernier test d'une version décide.
- Passer en Automatique ne demande pas de ré-authentification : le verrou et les rôles (propriétaire, opérateur de la créatrice) suffisent. Choix par défaut, faute de décision de Charles ; il pourra le changer quand l'Automatique sera réellement possible.
- L'événement du retour en copilote s'appelle `automatic_closed`. Son envoi sur Telegram reste à brancher par le module `telegram`.

## Alternatives rejetées

- **Un seul taux, playground et réel mêlés** : l'entraîneur connaît ses situations, ce qui gonfle le chiffre, et le mélange cache l'écart.
- **Garder l'Automatique après un changement de version** : une version neuve n'a rien prouvé avec de vrais fans.
