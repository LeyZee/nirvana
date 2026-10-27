# P4-01 Alertes personnalisées, demandes de service et historique des alertes
Statut : in_progress (ID validé par Charles le 27/10 à 20h37, carte « Les 5 sans capture, désir en tête »)
Phase : 4 (supervision)
Dépend de : P3-07 (Telegram, routage par sujet ; à caler avec le fil Telegram), persona (`notifications.alert_keywords`), cerveau (`BriefSchema`), ADR 0020, ADR 0024 (rails)
Branche : task/P4-01-custom-alerts

## Objectif
Charles crée ses propres alertes (une phrase en langage naturel, des mots-clés, ou les deux), choisit si elles mettent l'agent en pause sur ce fan, les active par créatrice, et retrouve chaque déclenchement dans un historique ; ce qui demande une main reste dans « À traiter », la seule boîte à faire.

## Contexte à lire
ADR 0020, ADR 0024, `P3-07-telegram-notifications.md`, `packages/contracts/src/telegram.ts` (sujets), `packages/contracts/src/events.ts` (`HANDOFF_CAUSES`), `packages/llm/src/schemas.ts` (`BriefSchema`), `apps/api/src/modules/agent/domain/hold.ts`, `apps/api/src/modules/supervision/domain/dashboard.ts` (`WHY`, compteur des gardes du jour), `apps/web/src/agent/causes.ts` (`CAUSE_LABELS`), `docs/design/README.md`, `docs/reference/desirely-analysis.md` (§ Alertes).

## Ce que fait Desirely
Alertes système (plus de script, vente, services proposés, plus de fonds) et alertes à soi : phrase évaluée sur chaque message du fan, avec prudence (seulement si le critère est clairement rempli), mots-clés déclenchés sans IA, option « Arrêter la conversation ». Assignation et sourdine par modèle. Diffusion choisie alerte par alerte. Page Notifications : alerte, modèle, fan, raison, date, « Ouvrir la conversation », filtres lues / non lues, type, modèle, « Marquer comme vu ».

## À faire
- [ ] Contrat `CustomAlert` (Bilan) : nom, phrase (500 car. au plus), mots-clés, `pausesAgent`, sujet Telegram. **Une ligne par créatrice** (RLS par `creator_id`) : une alerte qui vise plusieurs créatrices est enregistrée en plusieurs lignes, que l'écran présente comme une seule alerte. Bilan attribue la migration.
- [ ] Évaluation : les mots-clés en code (comme `alert_keywords`) ; la phrase par le cerveau, dans le même appel, sous la forme d'une liste fermée d'identifiants d'alertes vues (jamais un texte libre qui déciderait), la raison en une ligne. Le texte du fan reste une donnée (règle 4).
- [ ] Causes de passation : un mot-clé qui met en pause réutilise la cause `keyword` ; une phrase qui met en pause prend une nouvelle cause `custom_alert`, ajoutée en fin de `HANDOFF_CAUSES` (contrat, accord de Bilan) et complétée partout où les causes sont énumérées : `WHY` en supervision, `CAUSE_LABELS`, compteur des gardes du jour du Dashboard.
- [ ] Deux alertes système de plus : « demande de service » (contenu sur mesure, appel, cam, vocal demandé ; nouvelle intention `asks_for_service` du Brief) prévient un humain sans pause, car l'équipe peut la vendre ; « doute sur la personne » (intention `asks_if_bot`, déjà rendue par le cerveau mais sans alerte) passe la main si un humain est en poste et ne change rien à la garde `ai_disclosure`.
- [ ] Historique des alertes (Extension) : une sous-vue du Suivi, sans nouvel onglet (ADR 0024) ; la liste des déclenchements avec alerte, créatrice, fan, raison, date et lien vers la conversation, filtres, « Marquer comme vu ». Ce n'est pas une seconde boîte : une alerte qui met en pause crée sa ligne dans « À traiter » avec sa cause, et l'historique n'a ni compteur rouge sur le rail ni cloche.
- [ ] Une seule page de réglage, Réglages › Alertes, réservée au propriétaire (onglet et adresse, leçon de #217) : alertes système et personnalisées, créer, tester sur un message d'exemple, activer par créatrice, et pour chacune sa diffusion Telegram. Réglages › Telegram ne garde que la connexion des bots et des groupes, pour ne pas régler la même chose à deux endroits ; à caler avec le fil Telegram avant le code.

## Critères d'acceptation
- Tests : un mot-clé déclenche sans appel au modèle ; une phrase ne déclenche que sur un identifiant rendu par le cerveau ; `pausesAgent` met la conversation à l'humain avec la cause `keyword` ou `custom_alert` ; une alerte sur deux créatrices fait deux lignes, chacune lisible par sa seule créatrice ; un déclenchement n'envoie aucune donnée de fan sur Telegram (ADR 0020).
- Éval : fan qui demande une vidéo perso, fan qui demande « t'es un bot ? », fan qui propose de se voir.
- Écrans : Nuit et Jour, 1 440 et 400 px, mouvement réduit, état « Le serveur ne répond pas » ; rien qui ne demande une action n'est en rouge.

## Hors périmètre
Les alertes d'argent du compte (pas de portefeuille chez nous ; le plafond IA a déjà son alerte).

## Notes de session
- 27/10 (Agent, PR B1) : les mots-clés de la persona (`notifications.alert_keywords`) mettent l'agent en pause pour ce fan, comme leur contrat le dit : `alertKeywordsIn` (`agent/domain/alerts.ts`) lit en code, mots entiers une fois normalisés, chiffres lus en lettres, ce qu'il a écrit depuis la dernière réponse ; le composeur rend un `handoff` de cause `keyword` (détail `alert_keyword`) avant tout modèle, après un média signalé. Découpage validé avec le coordinateur : A Bilan (contrat `CustomAlert`, `custom_alert` dans `HANDOFF_CAUSES`, événement `alert_triggered` qui remplace `keyword_matched`, migration 0025, route) ; B2 Agent après A (alertes personnalisées, `alertsSeen` du Brief, `asks_for_service`, `asks_if_bot` avec un chatteur en poste, un seul message Telegram par pause, aucune raison qui cite le fan) ; C Extension (Réglages › Alertes, historique dans le Suivi).
