# 06 · Interface : extension, connexion à Reveal, playground (17 octobre 2026)

Demande de Charles : « commencer à travailler sur l'interface : l'extension et son design, la connexion avec Reveal (Messalina est enfin reliée à mon Reveal), un playground de test intégré pour discuter avec l'IA et voir ses fautes avant la mise en ligne. Et comment on apprend à l'agent à naviguer sur Reveal ? ». Brainstorm par Opus 5.5, sans code. Rien ici ne remplace un ADR : ce qui est retenu par Charles deviendra fiches (et ADR si structurant).

Maquettes (esquisses, hors dépôt) : six écrans du popup de l'extension et deux états du Playground (jugement, correction), rendus avec `@nirvana/design-system` et le lockup de `brand/`, livrés dans le fil du projet. Version 2 après le retour de Charles du 17/10 (logo exact, choix de plateforme, textes et hiérarchie).

## 1. « Apprendre à l'agent à naviguer sur Reveal » : deux apprentissages qui n'ont rien à voir

C'est la question la plus importante, parce que l'intuition (« on navigue sur l'interface pour lui apprendre ») mène à une mauvaise architecture.

**L'IA ne verra jamais Reveal.** Elle ne clique pas, ne lit pas de pages, ne sait pas ce qu'est un bouton. Une IA qui pilote une interface est lente (plusieurs secondes par action), chère (une image par écran), fragile (un bouton déplacé la casse) et facile à repérer pour l'anti-bot. C'est pour ça que l'ADR 0008 a choisi l'option B.

Il y a donc deux apprentissages, faits par deux « élèves » différents :

| | Qui apprend | Quoi | Comment | Combien de fois |
|---|---|---|---|---|
| **Le protocole Reveal** | le code (le connecteur) | quelles requêtes le site envoie pour lister les conversations, lire, envoyer, vendre ; comment la session est authentifiée | Charles navigue normalement sur Reveal pendant que l'**enregistreur** de l'extension note les échanges réseau ; une session de code (P1-02) en déduit le connecteur | une fois, puis à chaque changement de Reveal (l'enregistreur sert alors de détecteur) |
| **Le métier** | l'IA (persona, prompts, règles) | parler comme Messa, faire le KYC, vendre au bon moment, au bon prix | corpus (fil « Voix de Messa »), documentation chatting de Charles, **playground**, puis mode copilote | en continu |

Une fois le connecteur écrit, l'IA reçoit seulement des conversations propres (« Julien a écrit : … ; voici ce qu'on sait de lui ») et rend un brouillon. Elle ne sait même pas qu'il s'agit de Reveal : c'est ce qui permettra de brancher OnlyFans ou notre plateforme sans la ré-entraîner (ADR 0003).

**Les « trucs à savoir » sur Reveal** (prix minimum et maximum d'un média payant, types de messages, ce qui est interdit, taille des médias, délais) ne s'apprennent pas à l'IA non plus : ce sont des règles, donc du code (règle 3 de `CLAUDE.md`). Ils vont dans les `capabilities` du connecteur et dans la politique. Proposition : une section « Règles de la plateforme » dans `docs/reference/reveal-api-observed.md`, remplie avec Charles (ce qu'il sait du métier) et les CGU.

## 2. La connexion à Reveal, étape par étape

### Étape 0, côté Charles (maintenant que l'accès existe)

1. **Lire les CGU de Reveal** sur l'automatisation et les outils tiers. Une recherche web ne les trouve pas : il faut les lire connecté. C'est la condition de P1-03 et le premier risque du projet (bannissement, `threat-model.md`).
2. **Dire par quel compte on se connecte** : celui de Messa directement, ou le compte de Charles qui gère celui de Messa (« reliée à mon Reveal »). Ça change la session à capturer, et peut-être l'API elle-même (les accès agence ont souvent leurs propres routes). L'enregistreur tranchera, mais il faut enregistrer avec le compte qu'on utilisera en production.
3. **Créer un compte fan de test** sur Reveal, abonné à Messa. C'est le bac à sable réel : on peut lui écrire, lui envoyer un média payant, l'acheter au prix minimum, sans jamais toucher un vrai fan (règle 12). Sans lui, impossible d'observer un envoi ou une vente proprement.

### Étape 1, apprendre le protocole (phase 1)

Le parcours d'enregistrement (≈ 15 minutes, avec le compte fan de test dans une autre fenêtre) :

1. ouvrir la liste des conversations, faire défiler ;
2. ouvrir une conversation, remonter l'historique ;
3. recevoir un message du compte de test (onglet ouvert, puis onglet en arrière-plan) ;
4. répondre au compte de test ;
5. envoyer un média payant au compte de test, puis l'acheter depuis ce compte ;
6. consulter les ventes / relevés ;
7. se déconnecter, se reconnecter (pour voir comment la session meurt et renaît).

À refaire un autre jour, pour vérifier que les identifiants et les formats sont stables.

**Raccourci possible, dès aujourd'hui, sans attendre P0-01 et P1-01** : Chrome sait déjà tout enregistrer (DevTools → Réseau → « Exporter HAR »), WebSocket compris. Problème : un HAR contient les cookies de session et de vrais messages de fans. Il ne doit donc jamais quitter le PC de Charles tel quel. Proposition : un script d'anonymisation (mêmes règles que l'anonymiseur de P1-01 : `Cookie`/`Authorization`/`Set-Cookie` supprimés, identifiants hachés, textes tronqués, emails et téléphones masqués) qui tourne **sur le PC de Charles**, et seul le fichier anonymisé va dans `.scratch/inbox/`. Gain : les 10 questions de `connectors.md` peuvent avoir une réponse avant même que le monorepo existe, et l'enregistreur de P1-01 n'est plus sur le chemin critique (il reste utile comme détecteur de changements). À décider par Charles ; si oui, nouvelle fiche P1-00 et P1-02 ne dépend plus de P1-01.

### Étape 2, se brancher (phase 2)

FakeReveal reproduit ce qu'on a observé → connecteur en lecture seule → les conversations s'affichent dans le dashboard → envoi manuel depuis le dashboard.

Garde-fou proposé pour toute la phase 2 : une **liste blanche d'envoi** (`send_allowlist`) dans la configuration du compte plateforme. Tant qu'elle n'est pas vide, le connecteur refuse en code tout envoi vers un fan qui n'y figure pas. On y met le compte fan de test ; on la vide le jour où Charles décide d'ouvrir. C'est le même esprit que le kill switch : la sécurité ne dépend pas de la vigilance de quelqu'un.

## 3. L'extension

### Son rôle (inchangé, ADR 0008)

Petite et discrète : capturer la session (bouton « Synchroniser »), enregistrer le réseau quand on le lui demande, montrer l'état. Elle n'est pas le cockpit : le travail (inbox copilote, fiches fans, playground) vit dans le dashboard. Elle n'injecte rien dans la page Reveal, ne garde aucun secret, n'appelle aucune IA.

### Le popup, écran par écran (maquette v2, revue par Charles le 17/10)

Principes : un écran = un message principal (gros titre qui dit l'état en français, phrase qui dit ce que ça implique) et au plus **un** bouton néon, celui de l'action attendue ; tutoiement partout ; on dit « l'agent », jamais « le bot » ; le nom est toujours le **lockup du logo** (`brand/nirvana-lockup.svg`, auréole sur le i), jamais du texte en police : `.nv-popup__brand` du design system est à remplacer par le lockup (à reporter dans `docs/design/README.md` par la fiche qui code le popup).

1. **Premier lancement** : « Relie cette extension », code à 6 chiffres saisi en cases, bouton « Relier ».
2. **Choisir le compte** : sélecteur en haut du popup, groupé par créatrice ; Reveal actif, OnlyFans « Bientôt », plateforme Nirvana « Plus tard ». Sur reveal.me, le compte Reveal est choisi automatiquement. Une plateforme n'apparaît active que lorsque son connecteur existe (ADR 0003 : l'extension lit la liste des comptes plateforme depuis le backend, elle n'en code aucun en dur).
3. **Au quotidien** : pastille « Session valide », titre « L'agent répond en copilote », trois chiffres (à valider, conversations actives, ventes du jour), bouton néon « Valider les N propositions » qui ouvre l'inbox ; en dessous, resynchroniser et enregistreur ; « Tout arrêter » en pied, en rouge discret.
4. **Session expirée** : « L'agent est à l'arrêt », trois étapes numérotées avec l'étape en cours en néon, bouton « Synchroniser la session », mention que rien n'est gardé dans l'extension.
5. **Enregistrement** : chronomètre, nombre d'échanges notés, parcours à cocher (celui du §2), « Terminer et exporter » / « Annuler et tout effacer ».
6. **Tout arrêter** : confirmation qui dit ce qui s'arrête et comment repartir.

### Appairage

L'extension doit prouver au backend qu'elle est bien celle de Charles avant d'envoyer une session. Proposition : dans le dashboard, « Ajouter un appareil » affiche un code court à usage unique (valable 5 minutes) ; on le colle dans le popup ; le backend rend un jeton d'appareil (révocable depuis le dashboard). Pas de mot de passe dans l'extension.

### Option à trancher : un panneau latéral dans Reveal

Chrome permet un panneau latéral (`chrome.sidePanel`) à côté de la page, sans toucher à Reveal. On pourrait y afficher, pour la conversation ouverte, la fiche du fan et le brouillon proposé, avec « Approuver ». Avantage : Charles reste dans Reveal. Inconvénients : un deuxième cockpit à maintenir, et il faut lire quelle conversation est ouverte (donc observer la page, contraire à l'esprit « aucune intrusion »). Recommandation : **pas maintenant** ; le dashboard d'abord, et on rouvre la question en phase 4 si l'usage le réclame.

## 4. Le Playground

### Le principe qui compte

Le playground doit faire passer les messages par **exactement le même chemin** que la production (contexte → cerveau → politique → voix → gardes, `message-flow.md`). Sinon on teste autre chose que ce qui partira chez les fans.

La façon propre de l'obtenir dans notre architecture : le playground est une **plateforme** de plus, `playground`, avec son adaptateur en mémoire (comme `FakeConnector`). Le cœur ne sait pas qu'il est testé ; et par construction rien ne peut partir sur Reveal, puisque ces conversations ne sont rattachées à aucun compte Reveal. Les fans du playground sont fictifs, marqués comme tels, et exclus des statistiques.

### Ce qu'on peut y faire (maquette v2)

Le playground est un onglet de la section **Entraîner** du dashboard (prototype v3), à côté de **Corrections** et **Tests** ; la barre de navigation compte cinq entrées (décisions de Charles le 17/10) : Dashboard, Créatrices, Entraîner, Suivi, Réglages. Pas d'Inbox ni de page Fans dans Nirvana : la validation en copilote se fait dans Reveal, par l'extension. Une pastille « Bac à sable : rien ne part vers un fan » reste visible en tête de section.

Colonne de gauche, la partie, de la décision la plus fréquente à la plus rare :

- **Qui écrit côté fan** (segment) : *Moi* (Charles ou Messa écrit comme un fan) ; *Fan simulé* (une IA joue un fan) ; *Rejeu* (on rejoue une vraie conversation passée, anonymisée, et on regarde ce que l'agent aurait répondu à chaque tour).
- **Profil du fan**, en quatre familles lisibles plutôt qu'une liste technique : nouvel abonné, habitué qui dépense, méfiant (« t'es vraiment toi ? »), cas sensibles (rencontre, âge douteux, détresse).
- **Réglages de la partie** : persona, modèles, moment simulé (l'agent ne parle pas pareil à 23 h 40 un mardi), délais de réponse réels ou accélérés ; le reste derrière « Tous les réglages ».
- **Ce que l'agent sait de lui** (mémoire, éditable) : on peut démarrer avec un fan qui a déjà dépensé 200 €. Ce qui manque est écrit « inconnue », pas laissé vide.
- Plus tard : catalogue fictif (P6), dépôt d'une image pour tester le rôle sens.

Au centre, la conversation, la proposition en pointillés néon (`nv-bubble--draft`), et sous elle une seule question : **« Elle aurait dit ça ? »** avec trois réponses au clavier, **les mêmes touches qu'en copilote** : **C'est elle** (A), **Corriger** (E), **Rejeter** (R, qui régénère et garde le rejet). « Corriger » ouvre un panneau à la place du champ de saisie : une ou plusieurs raisons (pas son style, trop robot, trop direct, fait faux, répète, trop tôt pour vendre, occasion de vente ratée, aurait dû passer la main), ce qu'elle aurait écrit, et **ce que devient la leçon** : test (rejoué à chaque version), exemple de voix (proposé pour la persona, validé par Messa) ou règle à coder (part dans les fiches). On peut aussi revenir à n'importe quel tour et repartir de là (branche).

À droite, **pourquoi cette réponse**, dans l'ordre où on le lit : un verdict en tête (« Toutes les règles passent », ou la règle qui a bloqué), puis ce que l'agent a compris (intention, ton, action, brief en une phrase), les règles appliquées écrites en français (avec le nom technique au survol), la relecture avant envoi (gardes, réécritures), et les détails techniques (hash des prompts, coût, latence) en dernier. C'est ce panneau qui transforme « elle a dit un truc bizarre » en « l'agent a mal lu l'intention » ou « la voix a ignoré le brief ».

### Prototype v3 : ce qui a été ajouté pour entraîner, et ce qui a été retiré

Prototype cliquable : https://claude.ai/artifact/TZjCUAPFhxN4pJn978A9zz (animations de navigation, popup de l'extension dans une barre façon Chrome, largeur téléphone).

Ajouté, parce que chaque correction doit aboutir quelque part :

- **Corrections** : la banque de toutes les corrections (playground et copilote), filtrable, avec qui a corrigé (Charles ou Messa), ce qu'elle devient et son état (à traiter, dans la persona, fiche ouverte, test réussi).
- **Tests** : rejouer toute la suite sur une persona brouillon avant de la passer en ligne, score par famille, historique par version (« v0.4.0 : +2 réussis, 0 régression ») ; le test à l'aveugle de Messa y vit aussi.
- **Comparer** : deux propositions côte à côte dans la même conversation, on clique la meilleure.
- **Copilote** : la même barre « Elle aurait dit ça ? » que le playground, posée dans Reveal par l'extension, pour que la production nourrisse l'entraînement. Le panneau latéral (question 5) devient donc nécessaire, pas optionnel.
- **Dashboard** (v4, inspiré du tableau de bord Reveal) : revenu net, part vendue par l'agent, ventes, nouveaux abonnés, projection, panier moyen, offres acceptées, temps de réponse ; revenu par jour comparé à la période précédente, répartition par type de revenu, ventes par heure, fans qui rapportent le plus avec la part agent ou humain. Ces chiffres supposent les sources de revenus encore absentes du modèle de données (manques métier, en pause).
- **Suivi** : « Envoyées sans retouche » en premier, c'est la mesure de l'entraînement ; le mode automatique reste grisé tant qu'elle n'atteint pas 80 %.

Retiré, parce que rien ne s'en décidait : les chiffres du jour dans le popup (ventes, conversations actives) et le bloc « Détails techniques » du panneau pourquoi, réduit à une ligne de versions et un lien vers le message complet envoyé au modèle.

### Ce que deviennent les corrections

Chaque « Faux » ou « Réécrire » est enregistré. Un bouton le transforme en cas de test dans `evals/regression/`, rejoué à chaque changement de prompt, de persona ou de modèle. C'est la boucle de correction déjà décidée (« calibrer d'abord, pas de fine-tuning ») : le playground la démarre avant la mise en ligne, le mode copilote la prolonge après.

Deux modes de plus, utiles tôt :

- **Côte à côte** : la même réplique du fan, deux réponses (deux fournisseurs, ou deux versions de persona), on choisit la meilleure. C'est le moyen le plus rapide de trancher Grok 4.3 contre Mistral sur du vrai ressenti, en plus des évals.
- **À l'aveugle pour Messa** : elle voit des répliques sans savoir si elles viennent d'elle (corpus) ou du bot, et dit « ça, c'est moi / ça, ce n'est pas moi ». Un score de voix simple et honnête.

Un plafond de dépense par jour pour le playground (réglage), parce qu'un fan simulé qui parle à un bot peut consommer vite.

### Quand le construire

Le playground n'a **pas besoin de Reveal**. Il lui faut les fondations (P0), la passerelle LLM et le moteur (P3), et une persona (fil « Voix de Messa »). Proposition : ne pas attendre la phase 2 ; faire tourner le spike Reveal (P1) et le moteur IA avec son playground (début de P3) **en parallèle**, puis brancher le connecteur. Ainsi, le jour où Reveal est connecté, la voix a déjà été corrigée pendant des semaines. Ça modifie `roadmap.md` (ordre des phases), donc c'est une décision de Charles.

### Nom

`docs/design/README.md` et D-01 appellent « playground » la page de démonstration des composants (`_playground.tsx`). Pour éviter deux sens au même mot, proposition : cette page devient la **vitrine** (`_showcase.tsx`) et « Playground » désigne seulement le bac à sable de conversation. Glossaire mis à jour dans le même commit que cette note.

### Créatrices › Persona (prototype, 17/10)

Charles veut saisir la persona dans l'interface, calquée sur la fiche créatrice d'OnlyChat, sans fonctions ajoutées (« ils sont les boss pour ça »). **Créatrices** est une entrée de la barre de navigation (entre Dashboard et Entraîner, demandé par Charles) et liste les modèles ; une fiche par créatrice porte deux onglets, **Persona** et **Plateformes** (comptes et fans de test). La persona reprend les onglets et les champs d'OnlyChat, lus par leur MCP :

- **Détails** : prénom, date de naissance (l'âge en est calculé), genre, origine, fuseau, langues (choisies dans une liste), physique en listes de valeurs (taille, poids, pointure, cheveux, yeux, tour de poitrine en bonnet et tour), centres d'intérêt et traits ajoutés ou retirés un par un.
- **Infos en plus** : le texte libre d'OnlyChat (6 000 caractères au plus sur Telegram).
- **Comportement** : style de langage, découpage en plusieurs messages, délai de réponse, instructions.
- **Stratégies** : KYC (cibles, au plus N messages ou N minutes), sexualisation (cooldown), lancement des scripts (cooldown strict), négociation, suivi (délai). Style par défaut ou personnalisé ; « personnalisé » ouvre un champ d'instructions.
- **Relances** (délais, type, texte) et **petits rappels** (« nudges » d'OnlyChat).
- **Notifications** : ventes, agent coupé, plus de script, limite de plateforme, et **mots-clés** : dès qu'un fan en écrit un, l'agent prévient tout de suite et attend, pour qu'un humain reprenne la main. C'est obligatoire, donc appliqué par le code.

Comportement, Stratégies, Relances et Notifications reprennent pour l'instant la configuration OnlyChat du bot Telegram ; ils sont à retravailler pour Reveal avec la documentation d'OnlyChat. Les deux fiches OnlyChat de Messalina (OnlyFans et Telegram) se contredisent sur l'âge, les yeux, les tatouages, le métier et les animaux : ces champs sont marqués « à confirmer avec Messa ». Écarts admis seulement s'ils viennent d'une décision : `identity_policy` verrouillée (ADR 0012), délais et cooldowns appliqués par le code (CLAUDE.md, règle 3), versions testées et validées (ADR 0010). Le contenu réel reste hors du dépôt et hors de la maquette en ligne (ADR 0010).

### Créatrices : liste, fiche et suppression (prototype, 17/10)

La liste montre d'abord une bande de totaux (créatrices, agent actif, fans, revenus sur 30 jours), puis une carte par créatrice : statut de l'agent, plateformes et leur état, fans et payeurs, revenus sur 30 jours avec l'écart, part envoyée sans retouche (le mode auto reste grisé sous 80 %), version de la persona et ses tests, dernière activité. La fiche reprend ces chiffres en tête, au-dessus des onglets Persona et Plateformes. Chiffres fictifs.

**Supprimer une créatrice** (demandé par Charles) se confirme dans la page. Pour une créatrice active, on tape son nom. La suppression arrête l'agent pour elle, délie la plateforme sans rien effacer chez Reveal, et archive persona, versions et corrections 30 jours ; elle reste restaurable depuis « Supprimées récemment ». Une créatrice restaurée revient avec l'agent à l'arrêt. L'effacement définitif après 30 jours est une action irréversible au sens de CLAUDE.md (règle 12) : la fiche qui la construira devra le traiter.

### Réglages › Modèles IA (prototype, 17/10)

Contenu défini par le fil Lecture OnlyChat (`panneau-connecteurs-ia.md`, hors dépôt) et données de `getHealth()` / `testConnection()` (P3-01). L'ordre de lecture est le suivant :

1. **État global et coût du jour**, dans un seul verre. Le coût est animé et posé sur une jauge de budget, avec la projection à minuit et l'écart avec hier.
2. **Une bande secondaire** : coût du mois sur budget, coût par message envoyé, appels sur l'heure, taux de repli.
3. **Le coupe-circuit** « Mettre l'agent en pause », confirmé par une seconde action.
4. **Quatre rôles** : Voix, Cerveau, Vision, Juge. Chaque carte donne le modèle en gros, le repli, la médiane, les erreurs, le coût du jour et le dernier succès, avec une courbe de latence. Un repli actif met un liseré ambre. Changer de modèle propose « Lancer les tests avant », jamais un changement direct.
5. **Fournisseurs** : état de la clé (jamais la clé elle-même, qui vit dans les variables d'environnement du serveur), capacités (la vidéo de Grok 4.7 est « à vérifier »), prix, et un bouton « Tester la connexion ».
6. **Journal**, replié par défaut et filtrable par rôle.

Hors du panneau, une pastille sur Réglages et un bandeau en haut du Dashboard signalent un état dégradé ou coupé. La maquette montre quatre états : nominal, repli sur la Voix, budget à 92 % et clé xAI refusée. Le budget de 15 € par jour et de 300 € par mois est un exemple à fixer par Charles.

## 5. Ce qui touche les manques métier (en pause)

Rien ici n'est bloqué par eux, mais deux points en dépendent et attendent la documentation chatting de Charles : les profils de fans simulés (ils devraient refléter les vrais parcours fans et leur valeur), et le mode rejeu (il suppose l'import de l'historique Reveal). Les raisons de « Faux » propres à la vente seront affinées avec la même documentation.

## 6. Suites proposées (fiches à écrire après accord de Charles)

| Fiche | Contenu | Dépend de |
|---|---|---|
| P1-00 (si retenue) | anonymiseur HAR qui tourne sur le PC de Charles + parcours d'enregistrement | rien |
| P1-01 (amendée) | ajouter au popup l'état de session, l'appairage et « Tout arrêter » en phase 2 ; garder l'enregistreur | P0-01 |
| P2-xx | liste blanche d'envoi, compte fan de test dans les scénarios FakeReveal | P1-03 |
| P3-xx | plateforme `playground` (adaptateur en mémoire), écran Playground, corrections → évals, côte à côte | P0, LlmGateway |
| P3-xx | fan simulé (profils = scénarios d'`evals/adversarial` et `scenarios`) | moteur IA |
| D-01 (suite) | renommer `_playground.tsx` en vitrine | P0-01 |

## Questions ouvertes pour Charles

1. On se connecte avec le compte de Messa ou avec ton compte agence ?
2. D'accord pour créer un compte fan de test abonné à Messa ?
3. Le raccourci HAR anonymisé sur ton PC (fiche P1-00), oui ou non ?
4. Playground en parallèle du spike Reveal, avant le connecteur (change la roadmap) ?
5. Panneau latéral dans Reveal : confirmer « pas maintenant » ?
