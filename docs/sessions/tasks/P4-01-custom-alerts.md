# P4-01 Alertes personnalisées, demandes de service et page Notifications
Statut : todo (ID validé par Charles le 27/10 à 20h37, carte « Les 5 sans capture, désir en tête »)
Phase : 4 (supervision)
Dépend de : P3-07 (Telegram, routage par sujet), persona (`notifications.alert_keywords`), cerveau (`BriefSchema.risks`)
Branche : task/P4-01-custom-alerts

## Objectif
Charles crée ses propres alertes (une phrase en langage naturel, des mots-clés, ou les deux), choisit si elles mettent l'agent en pause sur ce fan, les active par créatrice, et retrouve chaque déclenchement dans une page Notifications.

## Contexte à lire
ADR 0020, `P3-07-telegram-notifications.md`, `packages/contracts/src/telegram.ts` (sujets), `packages/llm/src/schemas.ts` (`risks`), `apps/api/src/modules/agent/domain/hold.ts`, `apps/web/src/agent/causes.ts`, `docs/reference/desirely-analysis.md` (§ Alertes).

## Ce que fait Desirely
Alertes système (plus de script, vente, services proposés, plus de fonds) et alertes à soi : phrase évaluée sur chaque message du fan, avec prudence (seulement si le critère est clairement rempli), mots-clés déclenchés sans IA, option « Arrêter la conversation ». Assignation et sourdine par modèle. Diffusion choisie alerte par alerte. Page Notifications : alerte, modèle, fan, raison, date, « Ouvrir la conversation », filtres lues / non lues, type, modèle, « Marquer comme vu ». Son connecteur montre aussi des codes non documentés : contenu signalé, besoin d'un humain, mineur, IA détectée, solde bas.

## À faire
- [ ] Contrat `CustomAlert` : nom, phrase (500 car. au plus), mots-clés, `pausesAgent`, créatrices concernées, sujet Telegram ; stockage par créatrice (Bilan attribue la migration).
- [ ] Évaluation : les mots-clés en code (comme `alert_keywords`) ; la phrase par le cerveau, dans le même appel, sous la forme d'une liste fermée d'identifiants d'alertes vues (jamais un texte libre qui déciderait), la raison en une ligne. Le texte du fan reste une donnée (règle 4).
- [ ] Deux alertes système de plus : « demande de service » (contenu sur mesure, appel, cam, vocal demandé ; nouvelle intention `asks_for_service` du Brief) prévient un humain sans pause, car l'équipe peut la vendre ; « doute sur la personne » (intention `asks_if_bot`, déjà rendue par le cerveau mais sans alerte) passe la main si un humain est en poste et ne change rien à la garde `ai_disclosure`.
- [ ] Page Notifications (Extension) : la liste des déclenchements, filtres, « Marquer comme vu », lien vers la conversation ; zéro bruit : rien qui ne demande une action n'est en rouge.
- [ ] Écran Réglages › Alertes : créer, tester sur un message d'exemple, activer par créatrice, sujet Telegram.

## Critères d'acceptation
- Tests : un mot-clé déclenche sans appel au modèle ; une phrase ne déclenche que sur un identifiant rendu par le cerveau ; `pausesAgent` met la conversation à l'humain avec la cause « alerte » ; un déclenchement n'envoie aucune donnée de fan sur Telegram (ADR 0020).
- Éval : fan qui demande une vidéo perso, fan qui demande « t'es un bot ? », fan qui propose de se voir.

## Hors périmètre
Les alertes d'argent du compte (pas de portefeuille chez nous ; le plafond IA a déjà son alerte).

## Notes de session
