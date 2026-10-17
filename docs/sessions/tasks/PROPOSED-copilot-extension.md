# Poste du chatteur en copilote, dans l'extension sur Reveal
Statut : proposed
Phase : 4 (supervision), ne se code qu'après la clé xAI et la capture Reveal
Dépend de : P0-05 (brouillons, approve / reject), P0-06 (connecteur), table `training_notes` (fil Bilan, PR #46), capture HAR Reveal (P1-02)
Branche : task/<id>-copilot-extension

## Objectif (1 phrase)

Le chatteur valide, retouche ou refuse chaque brouillon de l'agent là où il travaille déjà, à côté de la conversation Reveal, et chaque geste nourrit le taux « en réel » qui déverrouille l'Automatique.

## Contexte à lire

- Décision de Charles (17/10, chat du projet, recommandation du coordinateur 21h47) : poste du chatteur dans l'extension, pas dans le CRM ; Suivi reste en lecture seule ; « moins d'écrans, plus de moteur ».
- `docs/roadmap.md` (phase 4 : « validation des propositions dans le panneau latéral de l'extension »).
- `docs/design/README.md` : « Copilote et raccourcis », « Extension Chrome » (aucun style injecté dans la page Reveal), « Clarté ».
- `packages/contracts/src/conversations.ts` (`ApproveDraftBodySchema`, `RejectDraftBodySchema`), routes `/v1/conversations/:id/drafts/:draftId/approve|reject`.
- ADR 0008 (session capturée par l'extension), ADR 0012 (`identity_policy`).

## Décisions à prendre avant le code

- **Surface** : panneau latéral Chrome (`chrome.sidePanel`) ouvert à côté de Reveal, pas une bulle injectée dans la page (règle « pas de verre au-dessus de Reveal »). À confirmer par la capture : l'extension sait quelle conversation Reveal est ouverte (URL ou requête observée).
- **Qui est connecté** : le chatteur se connecte à Nirvana dans le panneau avec son compte `operator` (Better Auth, même cookie que le dashboard sur le domaine de l'API). Le jeton d'appareil de l'extension (`EXTENSION_DEVICE_TOKEN`) reste réservé à la capture de session ; il ne valide jamais un brouillon.
- **Envoi** : l'envoi part du serveur par le connecteur (job `conversation.send`, idempotent), jamais par un clic simulé dans la page Reveal.

## Ce que l'API doit exposer (à valider par le fil Bilan)

1. `GET /v1/conversations/by-platform/:platformConversationId?creatorId=` : la conversation Nirvana qui correspond à la conversation Reveal ouverte, avec ses brouillons ouverts (`ConversationDetailSchema`). Ou un paramètre de filtre sur la liste existante.
2. `POST …/drafts/:draftId/approve` existe : sans `bubbles`, verdict `validated` ; avec `bubbles`, verdict `corrected`.
3. `POST …/drafts/:draftId/reject` existe, mais sa raison est libre : il faut un `reason` codé (même liste que le playground, `RejectReason` de `playground.ts`) plus une note libre facultative, pour que la note d'entraînement ait le même format que celles du playground.
4. Chaque approve / reject écrit une ligne `training_notes` (`validated` / `corrected` / `rejected`, source `production`), lue par le calcul du taux « en réel ».
5. Un événement temps réel (SSE ou interrogation courte) « nouveau brouillon pour cette conversation », pour que le panneau se mette à jour sans recharger.

## À faire (liste vérifiable)

1. Panneau latéral WXT (`entrypoints/sidepanel`), connexion `operator`, design system importé (`@nirvana/design-system/styles.css`).
2. Détection de la conversation Reveal ouverte (d'après la capture), appel 1 ci-dessus.
3. Brouillon affiché avec ses bulles, le brief en une ligne et ce que l'agent sait du fan (une ligne) ; trois gestes : Envoyer (`a`), Retoucher (`e`, édition en place), Refuser (`r`, raison en puces) ; raccourcis communs au playground.
4. États : aucun brouillon (« L'agent n'a rien proposé pour ce fan »), l'agent écrit, envoyé (vérifié par `send_verified`), relais à un humain (raison en mots).
5. Tests : unitaires sur la logique du panneau ; contrat contre `FakeReveal` pour la détection de conversation ; aucun envoi réel.
6. Glossaire : « Poste du chatteur » si le terme est retenu.

## Critères d'acceptation

- Un chatteur connecté valide, retouche ou refuse un brouillon de `FakeReveal` depuis le panneau, l'envoi part par le connecteur, et une note d'entraînement est écrite pour chaque geste.
- Rien n'est injecté dans la page Reveal.
- `pnpm check` et `pnpm test:all` verts.

## Hors périmètre

- Mode Automatique et son verrou (contrôle unique de la barre du CRM, fiche à part).
- Vocaux (fiche vocaux).
- Toute écriture vers un vrai fan avant l'accord explicite de Charles.

## Notes de session
