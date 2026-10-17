# 06 · Interface : extension, connexion à Reveal, playground (17 octobre 2026)

Demande de Charles : « commencer à travailler sur l'interface : l'extension et son design, la connexion avec Reveal (Messalina est enfin reliée à mon Reveal), un playground de test intégré pour discuter avec l'IA et voir ses fautes avant la mise en ligne. Et comment on apprend à l'agent à naviguer sur Reveal ? ». Brainstorm par Opus 5.5, sans code. Rien ici ne remplace un ADR : ce qui est retenu par Charles deviendra fiches (et ADR si structurant).

Maquettes (esquisses, hors dépôt) : popup de l'extension et écran Playground, rendues avec `@nirvana/design-system`, livrées dans le fil du projet.

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

### Ce que montre le popup (maquette)

- En-tête : flamme + « Nirvana » (Playfair italique), pastille d'état de la session : **Connectée** / **À surveiller** / **Expirée** (`platform_session`, `nv-status`).
- Le compte relié (« Messalina, via le compte agence ») : on voit d'un coup d'œil sur quel compte on agit.
- Trois lignes de faits : session envoyée il y a…, dernière lecture du serveur il y a…, mode (copilote / auto / pause).
- Un seul bouton néon : **Synchroniser la session** (la seule lumière de l'écran, comme le veut le design system).
- Interrupteur **Enregistreur** (éteint par défaut).
- **Tout arrêter** : le kill switch global, accessible là où Charles est déjà quand il voit un problème sur Reveal. Il appelle le backend ; l'extension n'arrête rien elle-même.
- Quand la session est expirée, le popup devient un guide en trois étapes (ouvrir Reveal, se connecter, synchroniser) et rappelle que rien ne part pendant ce temps.

### Appairage

L'extension doit prouver au backend qu'elle est bien celle de Charles avant d'envoyer une session. Proposition : dans le dashboard, « Ajouter un appareil » affiche un code court à usage unique (valable 5 minutes) ; on le colle dans le popup ; le backend rend un jeton d'appareil (révocable depuis le dashboard). Pas de mot de passe dans l'extension.

### Option à trancher : un panneau latéral dans Reveal

Chrome permet un panneau latéral (`chrome.sidePanel`) à côté de la page, sans toucher à Reveal. On pourrait y afficher, pour la conversation ouverte, la fiche du fan et le brouillon proposé, avec « Approuver ». Avantage : Charles reste dans Reveal. Inconvénients : un deuxième cockpit à maintenir, et il faut lire quelle conversation est ouverte (donc observer la page, contraire à l'esprit « aucune intrusion »). Recommandation : **pas maintenant** ; le dashboard d'abord, et on rouvre la question en phase 4 si l'usage le réclame.

## 4. Le Playground

### Le principe qui compte

Le playground doit faire passer les messages par **exactement le même chemin** que la production (contexte → cerveau → politique → voix → gardes, `message-flow.md`). Sinon on teste autre chose que ce qui partira chez les fans.

La façon propre de l'obtenir dans notre architecture : le playground est une **plateforme** de plus, `playground`, avec son adaptateur en mémoire (comme `FakeConnector`). Le cœur ne sait pas qu'il est testé ; et par construction rien ne peut partir sur Reveal, puisque ces conversations ne sont rattachées à aucun compte Reveal. Les fans du playground sont fictifs, marqués comme tels, et exclus des statistiques.

### Ce qu'on peut y faire (maquette)

Colonne de gauche, la partie :

- **Qui joue le fan** : *moi* (Charles ou Messa écrit comme un fan) ; *fan simulé* (une IA joue un fan d'après un profil : nouveau et timide, radin, pressé, « t'es un bot ? », veut la rencontrer, âge douteux…) ; *rejeu* (on rejoue une vraie conversation passée, anonymisée, et on regarde ce que le bot aurait répondu à chaque tour).
- **Réglages** : version de la persona, fournisseur par rôle (cerveau, voix), heure simulée (le bot ne parle pas pareil à 23 h 40 un mardi), délais humains réels ou accélérés.
- **Mémoire du fan**, éditable : on peut démarrer une partie avec un fan qui a déjà dépensé 200 € et dont on connaît le prénom et la ville.
- Plus tard : catalogue fictif (P6), dépôt d'une image pour tester le rôle sens.

Au centre, la conversation, avec le brouillon en pointillés néon (`nv-bubble--draft`), et sous chaque proposition :

- **Bien** · **Réécrire** (on tape ce que Messa aurait dit) · **Faux** (avec une raison à choisir : pas son style, trop robot, trop direct, erreur sur un fait, répétition, aurait dû passer la main, autre) · **Régénérer**.
- On peut revenir à n'importe quel tour et repartir de là (branche).

À droite, **pourquoi cette réponse** : intention lue, humeur, action, brief ; règles de politique appliquées (dont `identity_policy`) ; gardes déclenchées et régénérations ; version des prompts, coût, latence. C'est ce panneau qui transforme « elle a dit un truc bizarre » en « le cerveau a mal lu l'intention » ou « la voix a ignoré le brief ».

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
