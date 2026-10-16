# Brainstorm 01 — Premier échange

Notes de travail, pas encore des décisions. Légende : **[Fait]** vérifié, **[Hyp]** hypothèse, **[Reco]** ma recommandation, **[Q]** question pour Charles.

---

## 0. Ce que j'ai compris

Tu ne veux pas « un bot Reveal ». Tu veux **une plateforme d'exploitation pour créatrices** (nom de code Nirvana), dont le premier module est l'agent de chatting Reveal pour Messalina. Derrière viennent : veille + posting + montage Instagram, réponses aux commentaires, appli mobile de la modèle (notifs de ventes, to-do), la partie Imperium (compta, planning), et à terme ta propre plateforme privée.

Conséquence architecturale directe : le cœur ne doit **rien savoir de Reveal**. Reveal, OnlyFans, Instagram et ta future plateforme sont des *adaptateurs* branchés sur un cœur commun (créatrices, fans, conversations, contenus, ventes, événements). Si on rate ça, on réécrit tout le jour où tu lances ta plateforme.

---

## 1. Le point à trancher avant tout : « ne jamais dire que c'est une IA »

Ton message et ta doc disent l'inverse :
- Message : *il faut jamais qu'il dise qu'il est une IA*.
- Doc §3 : *le produit doit être transparent sur l'utilisation de l'IA et ne pas présenter des réponses automatisées comme ayant été personnellement écrites par Messalina.* Doc §10 : *transparence sur les réponses automatisées*.

**[Fait]** L'article 50 de l'AI Act européen (obligations de transparence pour les systèmes d'IA qui interagissent avec des personnes) s'applique depuis le 2 août 2026. Tu es en France, tes fans sont largement dans l'UE : un système conçu pour nier être une IA quand on le lui demande, c'est pile ce que le texte vise. Le risque n'est pas théorique : amende, mais surtout chargebacks et ban de compte si un fan se plaint.

**[Fait]** Je ne vais pas concevoir le comportement « mentir quand le fan demande sérieusement si c'est un bot ». Par contre tout le reste du réalisme, je le fais à fond.

**[Reco]** Une approche qui garde l'immersion sans le risque :
1. **Transparence au niveau du profil**, pas dans chaque message : une mention claire dans la bio / l'accueil (« messages gérés par l'équipe de Messa, avec assistance IA »). C'est ce que font déjà les agences sérieuses avec les chatteurs humains.
2. **La persona reste en personnage** pour tout le reste : ton, tics, humour, flirt, KYC. Le bot ne se présente jamais spontanément comme une IA, et il ne casse pas l'immersion pour rien.
3. **Question sincère et directe (« t'es un bot ? »)** → le bot ne ment pas, il **passe la main à un humain** (handoff immédiat, notif). C'est aussi un signal business utile : un fan qui doute est un fan à gérer avec soin.

Ça se code proprement : un détecteur de « question d'identité » dans le moteur de règles, pas dans le prompt.

---

## 2. Le vrai risque n°1 : le connecteur Reveal

**[Hyp]** Pas d'API publique. Tout repose sur l'extension Chrome.

**[Reco]** Ne pas scraper le DOM en premier choix. Une web-app moderne parle à son propre backend (XHR/fetch/WebSocket). Si l'extension **écoute ces réponses réseau dans la page** (sans exporter tes cookies, conforme à ta règle §5.A), on récupère des données structurées (IDs de conversation, IDs de fan, messages) beaucoup plus stables qu'un DOM qui bouge à chaque mise à jour. Le DOM sert seulement pour l'envoi et en secours.

**Premier spike (1 à 2 jours)** : ouvrir Reveal côté créatrice, DevTools onglet Réseau, et regarder :
- est-ce qu'il y a un WebSocket ou du polling pour les nouveaux messages ?
- est-ce qu'on reçoit les messages des conversations **non ouvertes** ?
- les IDs fan/conversation sont-ils stables ?

Si la réponse à la 2e question est non, tout le dimensionnement « 50-100 conversations » change. C'est la première chose à savoir.

**[Q]** As-tu un accès créatrice Reveal où on peut faire cet export réseau (fichier HAR) ? Et les CGU de Reveal, tu les as déjà lues côté automatisation ?

---

## 3. Choix du LLM : une contrainte que ta doc sous-estime

**[Fait]** Claude et GPT ont des politiques d'usage qui excluent la génération de contenu sexuellement explicite. Pour un chat qui doit flirter et vendre du PPV, ils ne seront pas le moteur d'écriture des messages. Grok ou un modèle open-weight hébergé (Mistral / Llama fine-tunés) sont les candidats réalistes pour la « voix ».

**[Reco]** Séparer deux rôles dans le moteur IA :
- **Cerveau** : analyse du message, extraction mémoire, décision (répondre / vendre / relancer / passer la main), détection des situations sensibles. Sortie JSON structurée. Peut tourner sur n'importe quel modèle fiable.
- **Voix** : rédaction du message dans le style de Messa, à partir de la décision du cerveau + persona + mémoire.

Ça rend le fournisseur interchangeable rôle par rôle, et ça empêche le LLM de « décider de vendre » tout seul : la décision commerciale passe par le backend.

---

## 4. Stack : où je challenge ta doc

| Sujet | Ta doc | Ma reco | Pourquoi |
|---|---|---|---|
| Architecture | Monolithe modulaire | **D'accord** | 1 dev + agents, 100 conversations : les microservices ne t'apporteraient que de la douleur |
| Backend | NestJS ou Fastify | **Fastify** + modules en dossiers stricts | Nest impose beaucoup de magie (décorateurs, DI) que les agents codeurs dupliquent mal ; la modularité vient des frontières, pas du framework |
| Files d'attente | Redis + BullMQ | **pg-boss ou Graphile Worker** (sur Postgres) | Une brique de moins à héberger et surveiller ; transactions DB + jobs atomiques = pas de doublons. Redis le jour où on en a besoin |
| Extension | WXT ou Plasmo | **WXT** | Plus activement maintenu, plus proche du standard |
| ORM | ? | **Drizzle** | SQL explicite, migrations versionnées, typage strict |
| Vector | pgvector si utile | **Plus tard** | Une fiche fan structurée + résumé suffit au début ; on mesure avant d'ajouter |
| Isolation créatrices | Séparation des données | **Postgres RLS** par `creator_id` dès le jour 1 | Le multi-créatrices et ta future plateforme en dépendent, coûteux à ajouter après |

**[Q]** Ton CRM pour Messalina (dépôt `dans-tes-cordes`, Next.js + Postgres sur Vercel) : tu veux qu'on regarde ses conventions comme base, ou on repart de zéro ? Vercel est bien pour le front, pas pour des workers qui tournent en continu : le backend Nirvana devra vivre ailleurs (Railway, Fly, un VPS).

---

## 5. La mémoire fan / KYC

**[Reco]** Le KYC n'est pas un questionnaire, c'est une **machine d'état de découverte** : une liste de « slots » (prénom, âge déclaré, métier, passions, situation, ce qui l'excite, budget perçu, rythme de dispo…) avec une priorité. Le cerveau sait quels slots manquent et glisse au plus une question naturelle par échange, seulement quand ça colle à la conversation.

Chaque fait stocké : valeur, source (message X), date, confiance, **déclaré vs déduit**, catégorie, rétention. Ta doc le dit déjà, c'est la bonne idée.

**[Reco]** Garde-fous fans, que je mets côté business et pas morale : détection d'un fan qui dépense au-delà de ses moyens, en détresse, ou mineur suspecté → pause des ventes + handoff. Ça te protège des chargebacks, des litiges et du ban plateforme.

---

## 6. Le reste du périmètre (Insta, appli mobile, Imperium, ta plateforme)

**[Reco]** On les note comme modules futurs, on dessine leurs frontières maintenant, on ne les code pas avant que le chatting Reveal tourne.

Points d'alerte déjà :
- **Posting et réponses aux commentaires Instagram** : faisables via l'API officielle (compte pro). **[Fait]**
- **Veille de reels tendance** : pas d'API officielle pour parcourir le feed / l'explore. Le scraping viole les CGU Meta et coûte des comptes. Il faudra un service tiers de données de tendances ou une veille semi-manuelle. **[Hyp]** à creuser.
- **Montage** (choix des rushs, sous-titres, dynamisation) : ffmpeg + transcription (Whisper) + un modèle de vision pour noter les rushs. Tout à fait faisable, module isolé.
- **Ta propre plateforme** : c'est là que l'architecture adaptateurs paie. Avec ta plateforme, plus d'extension fragile : le connecteur devient une API propre, et l'IA s'y branche par MCP comme tu l'imagines. Très bonne idée à moyen terme.

---

## 7. Imprégnation de la personnalité de Messa (étape plus tard)

Ce qu'il faudra comme accès, le moment venu :
- **Instagram** : l'export officiel « Télécharger vos informations » (format JSON, messages inclus). Bien plus propre que de faire défiler des conversations.
- **Historique e-chat** : un export depuis le desktop, ou l'accès via le MCP e-chat.
- Ce qu'on en tire : un guide de style (longueur, ponctuation, emojis, expressions, tics), un jeu d'exemples validés par Messa, et un **jeu de test** pour le Playground. Les messages des fans eux-mêmes sont anonymisés avant usage.

---

## 8. Questions ouvertes pour Charles

1. Transparence : OK pour l'approche « mention au profil + handoff humain sur question sincère » ?
2. Accès Reveal créatrice pour le spike réseau (export HAR) ?
3. Où sont les docs/code d'**Imperium** et d'**OnlyScript** (et la définition des « cartons ») ? Dépose-les dans le dossier Projet Nirvana ou dis-moi où les trouver.
4. `dans-tes-cordes` comme référence de conventions : oui / non ?
5. Mode de démarrage : je recommande **copilote d'abord** (le bot propose, un humain valide en 1 clic) puis automatisation progressive par type de message. D'accord ?

## Prochaine étape de mon côté

Analyse rubrique par rubrique de la doc OnlyChat (ta §2), puis proposition d'architecture cible + structure du monorepo et des fichiers `.md` pour les agents codeurs.
