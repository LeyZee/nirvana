# Poste du chatteur en copilote, dans l'extension sur Reveal : l'interface (ID à attribuer)
Statut : proposed (décision de Charles le 17/10 à 21h44, recommandation du coordinateur ; à coder après la clé xAI et la capture Reveal)
Phase : 3
Dépend de : la fiche « Copilote côté API » (PR #47, fil Bilan : contrat `copilot.ts`, routes, notes `live`), capture HAR Reveal (P1-02), lot A Reveal
Branche : task/<id>-copilot-extension

## Objectif (1 phrase)

Le chatteur voit le brouillon de l'agent à côté de la conversation Reveal ouverte et choisit Envoyer, Retoucher ou Refuser avec une raison, sans quitter Reveal.

Le côté serveur (brouillon en attente, verdict idempotent, note de calibrage `live`, rapprochement avec le message sortant) est dans la fiche « Copilote côté API » ; cette fiche ne le redéfinit pas. Elle couvre l'extension et ce qu'elle demande au contrat.

## Contexte à lire

- la fiche « Copilote côté API » du fil Bilan (PR #47, fichier PROPOSED-copilot-api.md), en entier : l'envoi par défaut, le verdict, les routes.
- `docs/design/README.md` : « Copilote et raccourcis », « Extension Chrome » (rien de stylé injecté dans la page Reveal), « Clarté ».
- `packages/contracts/src/playground.ts` : verdicts et raisons de refus, les mêmes qu'au playground.
- `apps/extension` (WXT), ADR 0008 (session capturée par l'extension), ADR 0012 (`identity_policy`).

## Comment ça se passe pour le chatteur

1. Il ouvre une conversation dans Reveal. Le panneau latéral de l'extension montre le brouillon de l'agent pour ce fan, ou « L'agent n'a rien proposé pour ce fan ».
2. **Envoyer** (`a`) : l'extension place le texte dans le champ de saisie de Reveal ; le chatteur relit et appuie lui-même sur Envoyer dans Reveal. L'agent n'envoie rien pendant cette phase et la garde d'écriture reste fermée (fiche API).
3. **Retoucher** (`e`) : édition en place dans le panneau, puis même chemin qu'Envoyer, verdict `corrected` avec les bulles finales.
4. **Refuser** (`r`) : raison en puces (liste fermée du playground) et note libre facultative ; rien n'est placé dans Reveal, le chatteur écrit sa propre réponse.
5. Le panneau passe à « Envoyé » quand l'API a rapproché le message sortant du brouillon, pas au clic.

## À accorder avec le fil Bilan avant le code

- **Qui a validé** : la note de calibrage doit porter le chatteur, pas seulement l'appareil. Proposition : le jeton d'appareil authentifie l'extension, et le panneau demande une fois la connexion `operator` du chatteur (même compte que le CRM) ; les routes `copilot` acceptent les deux. Sinon, rattacher l'appareil à un membre.
- **Placer le texte dans Reveal** : écriture dans le champ de saisie par le script de contenu (aucun style, aucun clic simulé sur Envoyer), à confirmer par la capture. Repli si le champ n'est pas fiable : copie dans le presse-papiers et « Colle dans Reveal ».
- **Mise à jour du panneau** : interrogation courte de `GET /v1/copilot/conversations/:platformConversationId/draft` quand le panneau est visible, ou flux SSE si la fiche API en ajoute un.

## À faire (liste vérifiable)

1. Panneau latéral WXT (`entrypoints/sidepanel`, `chrome.sidePanel`), design system importé (`@nirvana/design-system/styles.css`).
2. Détection de la conversation Reveal ouverte (URL ou requête observée, d'après la capture), puis appel de la route brouillon.
3. Brouillon affiché bulle par bulle, avec ce que l'agent sait du fan en une ligne ; trois gestes et leurs raccourcis, communs au playground.
4. États, en mots de chatteur : aucun brouillon, l'agent écrit, à valider, envoyé, un humain doit répondre (raison en mots), session Reveal expirée.
5. Tests : unitaires sur la logique du panneau ; détection de conversation et placement du texte contre `FakeReveal` ; aucun envoi réel.
6. Glossaire : « Poste du chatteur » si le terme est retenu (« Copilote » et « Verdict » viennent de la fiche API).

## Critères d'acceptation

- Contre `FakeReveal`, un chatteur connecté place, retouche ou refuse un brouillon depuis le panneau ; le verdict part une fois (rejeu sans effet) et le panneau ne dit « Envoyé » qu'après le rapprochement.
- Aucun style ni aucun élément injecté dans la page Reveal ; aucun clic simulé sur Envoyer.
- L'extension ne porte aucune clé LLM.
- `pnpm check` et `pnpm test:all` verts.

## Hors périmètre

- Les routes, le contrat et la migration (fiche API du fil Bilan).
- Le mode Automatique et son verrou (contrôle unique de la barre du CRM).
- Les vocaux.
- Toute écriture vers un vrai fan avant l'accord explicite de Charles.

## Notes de session
