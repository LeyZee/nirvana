# Test à l'aveugle avant l'Automatique (ID à valider par Charles)
Statut : proposed (demande du coordinateur le 28/10 à 8h17 ; ID à valider par Charles)
Phase : 3
Dépend de : capture Reveal (des réponses humaines réelles à comparer), P3-08 (recette du copilote), clé xAI ; ADR 0019, 0022
Branche : claude/project-thread-e0j3ow

## Objectif
Faire du test à l'aveugle exigé par les ADR 0019 et 0022 une séance outillée et reproductible, plutôt qu'un taux tapé à la main. La créatrice juge des réponses sans savoir qui les a écrites. Le serveur calcule le taux « sans retouche » des réponses de l'agent et l'enregistre dans `blind_tests` pour la version active de la voix et de la persona. C'est la troisième condition du verrou de l'Automatique, après 80 % en réel sur au moins 100 brouillons décidés.

## Ce qui existe déjà
- `blind_tests` (append-only) et `POST /v1/creators/:id/blind-tests { rate }` : propriétaire seul, connexion de moins de 10 minutes, version et persona posées par le serveur, ligne `audit_log` (`docs/architecture/message-flow.md` §6).
- Le verrou `automaticGate` (`packages/contracts/src/automatic.ts`) lit le dernier test de la version. Le Dashboard dit ce qui manque.
- Le playground sait rejouer une situation sur le vrai chemin de l'agent sans rien envoyer (`/v1/playground`, `compare`).
- Les messages capturés portent leur auteur (`messages.author` : `fan`, `human`, `ai`). Une réponse écrite par un chatteur dans Reveal est donc reconnaissable.

Ce qui manque : le jeu de cartes, le masquage, l'écran de jugement, le calcul du taux par le serveur.

## Protocole proposé

### Qui juge
- **La créatrice elle-même** (Messa pour Messalina), comme l'écrit l'ADR 0019. Elle connaît sa voix mieux que personne.
- **Sur la session du propriétaire**, à l'écran de Charles, et pas sur un compte créatrice : une créatrice ne voit jamais les données de ses fans (ADR 0023, droits des routes `fans` et `conversations`). Les pseudonymes et prénoms des fans sont remplacés à l'affichage (« Fan A », « Fan B »…). C'est un choix par défaut, à confirmer par Charles (question 1).
- Charles ne commente pas pendant la séance. Il clique « Suivant » si elle le lui demande, et c'est tout.

### Les paires
- **50 situations réelles, 100 cartes.** Une situation, c'est la fin d'une conversation réelle au moment où le fan attend une réponse : ses 6 derniers messages au plus, et rien de plus ancien.
- Chaque situation donne deux réponses :
  - **humaine** : ce qu'un chatteur a réellement envoyé à ce moment-là (`messages.author = 'human'` juste après le message du fan, dans Reveal ou dans Nirvana) ;
  - **agent** : ce que la version active écrit sur la même situation, rejouée par le playground sur le vrai chemin (brain, voix, gardes), sans rien envoyer.
- **Tirage** :
  - 50 conversations différentes, un seul fan par conversation, tirées au hasard parmi celles des 60 derniers jours qui ont une réponse humaine ;
  - un quota par moment de la relation, pour ne pas tester que du bavardage : environ 15 relation et KYC, 10 flirt, 10 sexto ou intime, 10 refus ou objection de prix, et 5 sujets délicats (demande de rencontre, « t'es un bot ? », hors sujet) ;
  - exclus : les situations avec détresse, mineur présumé ou passation (l'agent ne répond pas, il passe la main), et celles qui demandent l'envoi d'un média ou d'une étape de script (l'agent n'en envoie pas pendant le test).
- **Seuil de taille** : le test n'est valide qu'avec au moins 40 situations jugées. Si le tirage en trouve moins de 40, la séance ne s'ouvre pas, et l'écran dit combien il en manque.

### Le masquage
- **Même forme** pour les deux auteurs :
  - même découpage en bulles (la règle `behavior.split_messages` de sa persona appliquée aux deux) ;
  - pas d'heure ni de délai de réponse ;
  - pas d'accusé de lecture ;
  - aucune marque « modifié », « IA » ou « brouillon ».
- **Rien de corrigé** : ni fautes ni emojis ne sont retouchés, d'un côté comme de l'autre. On compare des réponses telles qu'elles partiraient.
- **Ordre aléatoire** : les 100 cartes sont mélangées. Les deux réponses d'une même situation ne se suivent jamais, avec au moins 10 cartes entre elles. Le tirage est fixé par une graine enregistrée, pour pouvoir rejouer la séance à l'identique.
- **Une carte à la fois** : le contexte de la conversation, puis la réponse. Elle ne voit jamais deux réponses côte à côte, qui se trahiraient l'une l'autre.
- Si la voix refuse ou si une garde bloque sur une situation, la carte de l'agent ne sort pas. La situation entière est remplacée par la suivante du tirage, pour ne pas laisser une carte humaine seule.

### Ce qu'elle répond, par carte
1. « Je l'enverrais telle quelle » / « Je la retoucherais » / « Je ne l'enverrais jamais ».
2. Facultatif : « Qui l'a écrite, à ton avis ? » (« Une personne » / « L'agent » / « Je ne sais pas »).

Elle peut revenir sur la carte précédente, jamais plus loin. Une séance peut se faire en deux fois : l'avancement est gardé, le tirage aussi.

### Le seuil de réussite
- **Ce qui ouvre l'Automatique**, conformément à l'ADR 0019, sans rien y changer :
  - le taux = part des cartes de l'agent jugées « telle quelle » ;
  - il faut au moins 80 % ;
  - il est calculé par le serveur et enregistré dans `blind_tests` par le propriétaire, à la fin de la séance.
- **Ce qui n'ouvre rien mais est rangé avec le test** :
  - le taux « telle quelle » des cartes humaines, comme référence (si les chatteurs font 70 %, un agent à 80 % est au-dessus d'eux) ;
  - le taux de « jamais » de l'agent : au-delà de 5 %, l'écran l'écrit en ambre (une réponse qu'elle n'enverrait jamais est plus grave qu'une retouche) ;
  - la part de bonnes devinettes sur l'auteur : 50 % veut dire que les deux sont indiscernables.

  En faire des conditions demanderait une nouvelle ADR (question 2).

### Où le résultat est rangé et lu
- **Nouvelles tables** (migration attribuée par Bilan), toutes en RLS par créatrice :
  - `blind_test_sessions` : créatrice, voix et persona figées à l'ouverture, graine, état (`open` / `done` / `abandoned`), dates ;
  - `blind_test_cards` : situation, auteur réel, référence du message humain ou de l'appel `llm_calls`, ordre, verdict, devinette.
- **À la fin de la séance**, le serveur calcule le taux et écrit la ligne `blind_tests` comme aujourd'hui. Le `POST` existant prend alors `sessionId` au lieu de `rate`, et le taux n'est plus saisi à la main. Le propriétaire valide sous une connexion de moins de 10 minutes.
- **Le Dashboard et le verrou** lisent `blind_tests` sans changement. Le détail (cartes, taux humain, devinettes) se lit dans Entraîner › Test à l'aveugle, avec les cartes « jamais » listées. Chaque carte « jamais » de l'agent peut devenir un cas de test d'éval, comme une note du playground.
- **Une séance périme** si la voix ou la persona change avant la fin : elle passe `abandoned`, puisque son résultat ne vaudrait plus pour la version active (ADR 0022).

## Ce que ça demande
- **Agent (playground)** :
  - le tirage des situations dans `conversations` et `messages`, par une lecture fournie par Bilan ;
  - le rejeu de l'agent sur chaque situation avec la version active ;
  - le masquage, le mélange avec la graine et le calcul des taux, sous forme de règles pures avec leurs tests ;
  - les routes `/v1/blind-tests`.
- **Bilan** : la migration des deux tables, le `POST` de `blind_tests` qui lit une séance, la lecture des situations avec réponse humaine (add-only dans `conversations`), et les contrats.
- **Suivi** : rien à changer pour juger. Un tag « tiré pour un test à l'aveugle » n'est pas nécessaire, puisque le tirage ne modifie rien.
- **Extension (écran)** : Entraîner › Test à l'aveugle.
  - Avant : combien de situations sont disponibles, le coût estimé en appels IA, le bouton « Commencer » (propriétaire).
  - Pendant : une carte plein écran, avec le contexte en bulles du fan et la réponse en bulle de la créatrice, les trois boutons, la devinette, et la progression « 23 / 100 ». Ni le taux ni l'auteur ne s'affichent pendant la séance.
  - Après : les trois taux, les cartes « jamais », puis « Enregistrer le test » (connexion récente).
  - Écran Nuit et Jour, 1 440 et 400 px, état « Le serveur ne répond pas ».
- **Coût IA** : environ 50 rejeux (brain et voix), plus 10 % pour les remplacements, de l'ordre de 1 à 2 € sur le budget du jour (grok-4.7). L'écran l'annonce avant de commencer.

## Estimation
- 3 PR, à peu près 2 à 3 sessions :
  - Bilan : migration, contrats et lecture des situations (une demi-session) ;
  - Agent : tirage, rejeu, règles, routes et tests (une session) ;
  - Extension : l'écran (une session).
- Séance avec Messa : environ 1 h 30 pour 100 cartes, à raison de 45 s à 1 min par carte. Elle peut se faire en deux fois.

## Critères d'acceptation
- Aucun taux ne peut être enregistré sans une séance terminée d'au moins 40 situations, pour la version active de la voix et de la persona.
- Pendant la séance, aucun champ de l'API ni de l'écran ne permet de savoir l'auteur d'une carte (test de contrat sur le DTO de carte : ni `author`, ni identifiant de message, ni d'appel).
- Le même tirage, rejoué avec la même graine, donne les mêmes situations dans le même ordre.
- Un changement de voix ou de persona en cours de séance la rend `abandoned`.
- Aucune vraie donnée de fan dans le dépôt : les tests utilisent des conversations inventées (ADR 0010).
- Rien n'est envoyé à un fan pendant toute la séance.

## Questions pour Charles (défauts pris en attendant)
1. Messa juge sur ta session, à ton écran, avec les noms des fans masqués, plutôt qu'avec un accès créatrice ouvert pour l'occasion. Défaut : oui, sur ta session.
2. Le taux de « jamais » et l'indiscernabilité restent des informations, sans devenir des conditions. En faire des conditions demanderait une nouvelle ADR. Défaut : informations seulement.
3. 50 situations (100 cartes) et un minimum de 40. Défaut : 50 et 40.

## Hors périmètre
L'ouverture de l'Automatique elle-même (déjà dans le verrou), les vocaux, les médias et les étapes de script dans le test, une autre créatrice que Messa.

## Notes de session
