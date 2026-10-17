# Alertes de nuit par Telegram (ID à attribuer)
Statut : proposed (décision de Charles le 17/10 à 21h44, recommandation du coordinateur ; à coder après la clé xAI et la capture Reveal)
Phase : 3
Dépend de : P0-05, P0-07b, P3-03 (clés chiffrées du CRM)
Branche : task/<id>-night-alerts

## Objectif
Quand l'agent tourne en automatique la nuit, les événements qui demandent un humain partent tout de suite sur un groupe Telegram (Charles et le chatteur d'astreinte), au lieu de dormir dans le CRM.

## Contexte à lire
`docs/architecture/data-model.md` (`domain_events`, outbox), `packages/contracts/src/events.ts`, `apps/api/src/modules/conversations/application/journal.ts` (événements publiés), `apps/api/src/modules/providers` (clés chiffrées, ADR 0016), `docs/runbooks/incident.md`, mémoire « budget plafond » (alerte à 16 €).

## À faire
- [ ] Module `alerts` (domain, application, infra, index). Un job Graphile lit `domain_events` depuis un curseur persistant, rejouable, et classe chaque événement :
  - **urgent** : `handoff_requested` pour mineur, non-consentement, détresse, demande de rencontre ou manipulation ;
  - **important** : budget à 16 €, session Reveal expirée (`session_state_changed`), agent arrêté, kill switch ;
  - **info** : bilan du matin, seulement à heure fixe dans le fuseau de la créatrice.
  La table de classement vit dans le code (règle 3), pas dans un prompt.
- [ ] Port `AlertChannel` avec un adaptateur Telegram (Bot API `sendMessage`, appel HTTP sortant uniquement) et un faux canal pour les tests.
  - Une clé d'idempotence par événement : un rejeu ne poste jamais deux fois.
  - En cas d'échec Telegram, nouvel essai avec délai croissant, puis mail en secours.
- [ ] Le message d'alerte ne contient ni le texte du fan ni de média. Il donne la créatrice, le niveau, la raison en français et un lien vers la conversation dans le CRM. Le texte du fan est une donnée privée (ADR 0010), et Telegram est un tiers.
- [ ] Jeton du bot et identifiant du groupe :
  - stockés comme service chiffré dans Réglages › Services (`providers`, nouveau type `telegram`), avec redemande du mot de passe ;
  - jamais dans l'extension ni dans `.env` en prod ;
  - test d'envoi depuis l'écran.
- [ ] Vérifier, et tester, que pendant l'attente d'un humain la conversation reste `handoff_requested` et que l'agent ne génère ni n'envoie plus rien au fan jusqu'à la reprise.
- [ ] Glossaire : « Alerte », « Astreinte ». Runbook incident : que faire à la réception de chaque niveau.

## Critères d'acceptation
- Tests unitaires du classement sur chaque type d'événement.
- Test d'intégration du job : rejouer deux fois le même lot ne poste qu'une fois sur le faux canal, et le curseur avance.
- Un événement urgent créé par le bout en bout phase 0 arrive sur le faux canal en moins d'une minute.
- `pnpm check`, `pnpm test:all` verts. Aucun jeton dans le dépôt.

## Hors périmètre
Les réponses depuis Telegram (aucune commande ne pilote l'agent depuis le groupe), les notifications push de la PWA, le planning d'astreinte (le groupe est fixe pour commencer), l'écran Suivi.

## Notes de session
