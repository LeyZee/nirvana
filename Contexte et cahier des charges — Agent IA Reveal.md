# Contexte et cahier des charges — Agent IA Reveal

## Objectif court du projet

Concevoir et développer un agent IA de chatting pour Reveal.me, avec une extension Chrome et une architecture modulaire, robuste et évolutive. Priorités : fiabilité, qualité conversationnelle, mémoire client et code propre, afin d'intégrer progressivement de nouvelles fonctionnalités.

**PROJET — Agent IA de chatting pour Reveal.me**

Document de cadrage et de brainstorming architectural avec Claude Code

**Version 1.0 — Octobre 2026**

## 1. Contexte et vision

Je souhaite développer une application indépendante permettant d'assister puis d'automatiser, dans les limites autorisées, la gestion des conversations sur **Reveal.me**, une plateforme de créateurs de contenu pour adultes.

La première créatrice concernée sera **Messalina**.

J'ai déjà travaillé sur deux projets, **OnlyScript** et **Imperium**, dont certaines idées, fonctionnalités et composants pourraient être réutilisés. Tu disposes peut-être de contexte sur ces projets dans nos anciennes sessions. Si ce contexte est incomplet, demande-moi les informations nécessaires plutôt que de supposer leur fonctionnement.

Je souhaite notamment réutiliser ou repenser :

- La création et la gestion des scripts conversationnels.
- Le système de « cartons » utilisé dans mes précédents projets.
- Les outils de gestion opérationnelle et de suivi.
- Les mécanismes de structuration des contenus commerciaux.

**Attention : ne réutilise pas automatiquement du code existant.** Il faudra d'abord examiner sa qualité, son architecture, ses dépendances et sa pertinence pour ce nouveau produit.

## 2. Référence fonctionnelle principale : OnlyChat

Voici une documentation particulièrement importante :

[**https://docs.only-chat.ai/getting-started/welcome**](https://docs.only-chat.ai/getting-started/welcome)

Je souhaite que tu l'étudies attentivement, rubrique par rubrique, notamment :

- Connexion et extension Chrome.
- Configuration de la persona.
- Fonctionnement de l'agent conversationnel.
- Découverte et qualification des fans.
- Gestion des notes et de la mémoire.
- Scripts conversationnels.
- Médias et contenus payants.
- Négociation commerciale.
- Relances automatiques.
- Playground et simulations.
- Fonctionnalités API et MCP, si elles sont documentées.

OnlyChat constitue une **référence fonctionnelle**, pas un modèle architectural dont nous connaissons le code source.

Je veux que tu identifies ce que cette documentation confirme réellement, ce qui reste inconnu, les bonnes idées à reprendre et les aspects que nous pourrions améliorer.

Ne suppose pas que les méthodes d'intégration utilisées sur OnlyFans fonctionneront sur Reveal.

## 3. Objectif du produit

Construire un agent conversationnel capable de :

1. Comprendre le contexte d'une conversation.
2. Répondre naturellement en français.
3. Adopter la personnalité éditoriale de Messalina, avec son accord.
4. Construire une relation suivie et respectueuse avec les fans.
5. Découvrir progressivement leurs centres d'intérêt et préférences.
6. Enregistrer les informations pertinentes dans une mémoire structurée.
7. Réutiliser cette mémoire lors des conversations futures.
8. Suivre des scripts conversationnels.
9. Recommander des contenus pertinents et gérer des propositions commerciales.
10. Passer la main à un humain lorsque nécessaire.

L'objectif est d'obtenir des conversations spontanées, chaleureuses et cohérentes, sans réponses répétitives, maladroites ou artificiellement commerciales.

Le produit doit être transparent sur l'utilisation de l'IA et ne pas présenter des réponses automatisées comme ayant été personnellement écrites par Messalina.

## 4. La priorité absolue : une architecture durable

Je veux une architecture professionnelle, mais sans complexité inutile.

Mes exigences :

- Code propre, lisible et maintenable.
- Responsabilités clairement séparées.
- Modules indépendants et faiblement couplés.
- Interfaces et contrats explicites.
- Dépendances maîtrisées.
- Typage strict.
- Tests automatisés.
- Gestion systématique des erreurs.
- Journalisation structurée.
- Observabilité.
- Sécurité dès la conception.
- Documentation technique à jour.
- Migrations de base de données maîtrisées.
- Possibilité de changer de fournisseur IA.
- Possibilité d'ajouter d'autres plateformes et créatrices.
- Possibilité d'ajouter de nouvelles fonctionnalités sans réécrire le cœur du système.

Je ne veux ni code spaghetti, ni architecture improvisée, ni sur-ingénierie.

Je privilégie **un monolithe modulaire bien conçu** pour commencer, plutôt qu'une architecture microservices prématurée. Mais je veux que tu challenges ce choix.

## 5. Architecture fonctionnelle envisagée

L'application pourrait être divisée en plusieurs domaines.

### A. Connecteur Reveal

Responsable exclusivement des interactions avec Reveal.

Il devra potentiellement :

- Détecter les conversations et nouveaux messages.
- Identifier les fans.
- Lire les informations disponibles dans l'interface.
- Récupérer les notes.
- Lire les scripts et les métadonnées des médias.
- Préparer ou exécuter des actions autorisées.
- Vérifier que les actions ont effectivement réussi.
- Détecter les erreurs, déconnexions et changements d'interface.

L'extension Chrome est notre première hypothèse technique.

Reveal ne dispose pas, à notre connaissance, d'une API publique documentée. Il faut vérifier si une intégration partenaire existe et si l'automatisation est autorisée.

L'extension devra privilégier les interfaces autorisées et les informations accessibles dans la session locale. Ne pas exporter les cookies ou les jetons de session vers un serveur tiers pour contourner les mécanismes d'authentification.

### B. Orchestrateur conversationnel

Responsable de :

- La réception des événements.
- L'ordonnancement des conversations.
- La gestion des files d'attente.
- La prévention des réponses en double.
- La gestion des délais.
- La reprise après erreur.
- La synchronisation des états.
- Les interventions humaines.
- Le déclenchement des différents modules métier.

Chaque conversation devra pouvoir être traitée indépendamment, avec un contrôle de concurrence adapté.

### C. Moteur IA

Responsable de :

- L'analyse du message.
- La compréhension du contexte.
- La préparation de réponses.
- La sélection d'outils.
- La proposition de mises à jour mémoire.
- La recommandation d'actions commerciales.
- L'identification des situations nécessitant une intervention humaine.

Le modèle ne devra pas directement manipuler le navigateur. Il appellera des outils métier exposés par notre backend.

L'intégration IA devra être indépendante du fournisseur.

Candidats à évaluer : Grok, Claude, GPT et modèles open-weight adaptés.

Le choix définitif dépendra des performances, du coût et de l'autorisation contractuelle d'un usage commercial dans un contexte de divertissement adulte consensuel.

### D. Persona de Messalina

Créer une fiche persona structurée comprenant :

- Informations biographiques validées.
- Personnalité.
- Manière de s'exprimer.
- Humour.
- Vocabulaire.
- Longueur habituelle des messages.
- Style de ponctuation.
- Expressions naturelles.
- Exemples de conversations autorisés.
- Préférences et limites.
- Sujets à éviter.
- Règles de cohérence.

Cette persona doit être versionnée, testable et distincte des instructions techniques.

Je souhaite pouvoir améliorer le style sans toucher au code.

### E. Mémoire et CRM

La mémoire est une fonctionnalité centrale.

Lorsqu'un fan arrive, l'agent doit apprendre progressivement à le connaître, sans transformer la conversation en questionnaire.

Informations potentiellement utiles, lorsqu'elles sont volontairement communiquées :

- Prénom ou pseudonyme.
- Centres d'intérêt.
- Activités et passions.
- Sujets de conversation précédents.
- Préférences de communication.
- Événements futurs mentionnés.
- Préférences commerciales.
- Historique des contenus achetés.

Il faut éviter de collecter systématiquement des informations sensibles ou des données personnelles non nécessaires, notamment les coordonnées et la localisation précise.

Je veux une mémoire hybride :

- Fiche structurée du fan.
- Résumé opérationnel.
- Historique récent.
- Événements importants.
- Recherche contextuelle si nécessaire.

Chaque information mémorisée devrait idéalement posséder :

- Une source.
- Une date.
- Un niveau de confiance.
- Une catégorie.
- Une politique de conservation.
- Une possibilité de correction ou suppression.

Le système doit distinguer les faits explicitement déclarés des déductions de l'IA.

Objectif : limiter les tokens sans sacrifier la continuité relationnelle.

### F. Moteur de scripts

À terme, intégrer un système de scripts inspiré de nos travaux sur OnlyScript et de la documentation OnlyChat.

Fonctionnalités possibles :

- Scripts structurés en étapes.
- Conditions de progression.
- Variantes de messages.
- Délais.
- Association de médias.
- Règles commerciales.
- Suivi des étapes terminées.
- Reprise de script.
- Interruption et intervention humaine.

Les scripts doivent être pilotés par un moteur d'états explicite, pas uniquement par les décisions libres du LLM.

Le système de « cartons » devra être défini à partir de la documentation de mes anciens projets.

### G. Catalogue de médias et PPV

Module futur permettant :

- L'indexation des médias.
- Les descriptions.
- Les catégories.
- Les tarifs.
- Les droits d'utilisation.
- Le suivi des envois.
- Le suivi des achats confirmés.
- La prévention des doublons.
- Les recommandations contextualisées.

Les contraintes commerciales devront être appliquées par le backend, et non uniquement par le prompt.

### H. Supervision humaine

Prévoir dès l'origine :

- Validation de réponses.
- Reprise manuelle des conversations.
- Notifications.
- Journal des décisions.
- Suspension de l'automatisation.
- Contrôles sur les ventes.
- Traitement des demandes personnelles.
- Signalement des erreurs et situations sensibles.

L'ajout futur d'ElevenLabs pour les messages vocaux devra utiliser cette même infrastructure de validation.

## 6. Extension Chrome : défi technique majeur

L'absence d'API Reveal est notre principal risque.

Je veux que tu étudies :

- Manifest V3.
- Content scripts.
- Service workers.
- Communication extension/backend.
- MutationObserver et détection des changements.
- Applications web dynamiques.
- Interfaces virtualisées.
- Identification stable des conversations.
- Synchronisation des messages.
- Gestion de plusieurs onglets.
- Reconnexion.
- Résilience aux modifications du DOM.
- Limitations des sessions navigateur.
- Sécurité des permissions.

Nous devons éviter que l'IA analyse des captures d'écran et navigue visuellement à chaque réponse si une intégration structurée plus fiable est possible.

En revanche, l'automatisation visuelle peut être utile pour les tests et les cas exceptionnels.

**Premier objectif technique : démontrer que l'extension peut suivre plusieurs conversations, identifier leurs fans et récupérer les nouveaux messages de manière fiable.**

Si Reveal ne permet pas de détecter les messages des conversations non ouvertes, nous devrons identifier cette limite avant d'aller plus loin.

## 7. Stack technique : propositions à challenger

Hypothèse initiale :

- TypeScript pour l'ensemble du projet.
- Extension Chrome avec WXT ou Plasmo.
- Application web avec Next.js.
- Backend Node.js avec Fastify ou NestJS.
- PostgreSQL.
- Redis et BullMQ pour les tâches.
- pgvector si la recherche sémantique apporte une vraie valeur.
- Playwright pour les tests.
- OpenTelemetry et Sentry pour l'observabilité.
- Monorepo avec pnpm et éventuellement Turborepo.

Ce ne sont pas des choix imposés.

Je veux une analyse comparative argumentée, notamment sur :

- NestJS contre Fastify.
- WXT contre Plasmo.
- Monorepo contre plusieurs dépôts.
- Monolithe modulaire contre services séparés.
- ORM adapté.
- Gestion des événements.
- Files d'attente et durabilité des tâches.
- Stratégie de tests.
- Hébergement.
- Gestion des secrets.
- Coûts d'exploitation.

Choisis la simplicité lorsqu'elle est compatible avec la fiabilité et l'évolution future.

## 8. Performances et objectifs

À terme, je souhaite pouvoir gérer :

- Environ 50 conversations actives en période calme.
- Jusqu'à 100 conversations actives en période de pointe.
- Un objectif de réponse inférieur à deux minutes pour les messages automatisables.

Ces chiffres sont des objectifs produit, pas des performances déjà démontrées.

Il faudra mesurer :

- Latence de détection.
- Latence de génération.
- Latence d'envoi.
- Taux de réussite des actions.
- Messages perdus.
- Doublons.
- Coût API.
- Consommation de ressources.
- Taux d'intervention humaine.
- Qualité conversationnelle.

Je souhaite une architecture capable d'évoluer progressivement, mais pas dimensionnée artificiellement pour des millions d'utilisateurs dès le départ.

## 9. Qualité conversationnelle

La qualité du chatbot sera aussi importante que l'infrastructure.

Je veux créer un système d'évaluation capable de mesurer :

- Le naturel du français.
- La spontanéité.
- La cohérence avec la persona.
- La pertinence des réponses.
- La capacité d'écoute.
- La continuité sur plusieurs jours.
- La qualité de la mémoire.
- L'absence de répétitions.
- Le respect des limites du fan.
- La pertinence des propositions commerciales.
- La capacité à ne pas vendre lorsque ce n'est pas approprié.

Nous pourrons utiliser des exemples de conversations réelles uniquement lorsque leur réutilisation est autorisée et après minimisation ou anonymisation des données personnelles.

Je souhaite un Playground permettant de simuler des fans et de comparer plusieurs versions de prompts ou modèles avant tout déploiement.

## 10. Sécurité, conformité et fiabilité

Ces sujets doivent être intégrés dès le début :

- Respect des conditions de Reveal.
- Transparence sur les réponses automatisées.
- Vérification des restrictions d'âge applicables.
- Protection des données personnelles et intimes.
- Consentement et droits sur les contenus.
- Gestion des accès.
- Séparation des données par créatrice.
- Chiffrement.
- Journal d'audit.
- Rétention et suppression des données.
- Protection contre les injections de prompt provenant des messages.
- Validation des actions sensibles.
- Respect des conditions des fournisseurs IA.
- Arrêt d'urgence et reprise manuelle.

Un message envoyé par un fan doit être traité comme une donnée non fiable, jamais comme une instruction système.

## 11. Roadmap envisagée

### Phase 0 — Discovery et architecture

- Analyser la documentation OnlyChat.
- Auditer les fonctionnalités Reveal.
- Examiner les projets OnlyScript et Imperium.
- Formaliser les besoins.
- Identifier les risques.
- Comparer les choix techniques.
- Proposer une architecture.
- Définir les critères de validation.

### Phase 1 — Connecteur Reveal en lecture seule

- Extension Chrome.
- Identification de la conversation.
- Lecture des messages.
- Détection des nouveaux messages.
- Lecture des notes accessibles.
- Synchronisation avec le backend.
- Tests de robustesse.

### Phase 2 — Backend et mémoire

- Base de données.
- Modèle de domaine.
- Événements.
- Files d'attente.
- Mémoire structurée.
- Gestion des erreurs.
- Observabilité.

### Phase 3 — Agent conversationnel

- Persona Messalina.
- Intégration LLM.
- Outils de lecture.
- Rédaction de réponses.
- Mise à jour contrôlée des notes.
- Playground.
- Tests qualitatifs.

### Phase 4 — Premier bot fonctionnel

- Réponses contextualisées.
- Envoi supervisé.
- Continuité entre sessions.
- Gestion des conversations.
- Tableau de bord minimal.
- Évaluations de qualité et de fiabilité.

### Phase 5 — Fonctionnalités commerciales

- Scripts.
- Cartons.
- Médias.
- PPV.
- Règles de prix.
- Relances.
- Suivi des résultats.

### Phase 6 — Automatisation et montée en charge

- Amélioration de la concurrence.
- Supervision avancée.
- Automatisation des actions autorisées.
- Tests de charge.
- Optimisation des coûts.
- Surveillance continue.

### Phase 7 — Extensions futures

- ElevenLabs et vocaux.
- Plusieurs créatrices.
- Autres plateformes.
- Analyses commerciales.
- Amélioration continue des modèles.
- Outils avancés de formation et d'évaluation.

## 12. Premier livrable attendu

Je souhaite obtenir le plus rapidement possible **un bot de chatting réellement fonctionnel**, sur un environnement de test ou une intégration Reveal autorisée.

Ce premier livrable doit :

- Lire le contexte d'une conversation.
- Consulter une mémoire client.
- Utiliser la persona de Messalina.
- Générer des réponses naturelles et pertinentes.
- Proposer les informations à mémoriser.
- Permettre une validation humaine.
- Envoyer les réponses lorsque l'intégration le permet.
- Éviter les doublons.
- Journaliser les erreurs.
- Être testable et maintenable.

Je ne souhaite pas encore développer tout le système de scripts, de PPV, de vocaux ou de statistiques avancées.

Mais je veux que leur intégration future ait été anticipée dans les frontières des modules et les contrats techniques.

## 13. Ce que j'attends de toi, Claude

**Ne commence pas à coder immédiatement.**

Je veux d'abord brainstormer avec toi comme avec un architecte logiciel senior et un CTO technique.

Procède dans cet ordre :

1. Reformule ta compréhension du produit et de mes objectifs.
2. Analyse en profondeur la documentation OnlyChat.
3. Identifie les risques et inconnues de l'intégration Reveal.
4. Challenge les hypothèses de ce document.
5. Propose deux ou trois architectures possibles.
6. Compare leurs avantages, limites, coûts et complexité.
7. Recommande une architecture cible argumentée.
8. Propose une structure de monorepo et des frontières de modules.
9. Définis les principales entités métier et leurs responsabilités.
10. Définis les interfaces entre l'extension, le backend, l'IA et la mémoire.
11. Propose les mécanismes de fiabilité, de synchronisation et de reprise sur erreur.
12. Construis une roadmap détaillée avec jalons, tests et critères d'acceptation.
13. Identifie les décisions irréversibles ou coûteuses à modifier.
14. Prépare ensuite seulement le plan d'implémentation du premier prototype.

Je veux que tu distingues clairement :

- Les faits vérifiés.
- Les hypothèses.
- Les décisions proposées.
- Les points à tester.
- Les questions qui nécessitent ma réponse.

Lorsque plusieurs options sont possibles, donne-moi une recommandation précise plutôt qu'une liste interminable de technologies.

Si une idée est mauvaise, fragile, trop chère ou inutilement complexe, dis-le clairement.

**Notre philosophie : construire une fondation simple mais solide, qui permette d'améliorer le produit pendant des années sans devoir tout reconstruire.**

Le succès de la première version ne sera pas mesuré au nombre de fonctionnalités, mais à trois choses : **fiabilité du connecteur Reveal, qualité du chatting et propreté de l'architecture.**
