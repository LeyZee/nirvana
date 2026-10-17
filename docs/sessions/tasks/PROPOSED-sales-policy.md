# Politique de vente du corpus (ID à proposer)
Statut : in_progress, ID proposé (file du coordinateur, 17/10 ; ID à valider par Charles)
Phase : 3
Dépend de : P3-06 (composeur), P0-08 (champs de persona demandés au fil plomberie), P6-01 (catalogue, pour le branchement)
Branche : claude/project-thread-e0j3ow

## Objectif
Faire porter au code les leçons chiffrées du corpus de vente (`/mnt/project-files/onlychat/corpus-vente/README.md` §3 et §4, hors dépôt) : peu d'offres, jamais après un manque d'argent avoué, jamais de mépris, de mensonge sur le payant ni de demande de photos intimes au fan, et la main à un humain sur un contenu dangereux.

## Contexte à lire
`docs/architecture/ai-engine.md` (La politique, Les gardes), `apps/api/src/modules/agent/domain/guards.ts`, `hold.ts`, `packages/llm/src/schemas.ts`, `packages/llm/prompts/brain/default.md`, la méthode de chatting (`/mnt/project-files/chatting/methode-chatting.md`, hors dépôt).

## À faire
- [x] `agent/domain/policy.ts` : `offerDecision` dit si une offre est permise maintenant, avec la raison quand elle ne l'est pas :
  - plus de 3 offres aujourd'hui (heure de la créatrice) ;
  - 5 offres sans achat depuis le dernier achat ;
  - une offre refusée aujourd'hui ;
  - le drapeau « budget nul » ;
  - un risque `money_trouble`, `distress`, `self_harm` ou `minor_suspected`.
  
  Les plafonds sont dans `OfferLimits`, en attendant les champs de persona.
- [x] Gardes bloquantes :
  - demander des photos ou vidéos intimes au fan ;
  - mépris (« radin », « menteur », « mendiant ») ;
  - mensonge sur le payant (« rien à payer », « pas besoin d'argent »).
  
  Garde souple : la bouderie culpabilisante (« tu me déçois », « ça m'a refroidie »).
- [x] Cerveau : deux risques nouveaux, `dangerous_request` (L05) et `real_abuse` (L28), qui passent la main à un humain avant la voix, comme le mineur.
- [x] Évaluations L05 et L28 : le bot ne répond pas, il relaie (`evals/adversarial/dangerous-request.yaml`, `real-abuse-story.yaml`, mesurées quand Promptfoo est branché).
- [ ] Brancher `offerDecision` dans le composeur dès que les offres, les ventes et le drapeau existent (P6-01, mémoire du fan).

## Critères d'acceptation
- Tests unitaires de chaque règle : cas nominal, cas limite, cas adversarial.
- Aucune phrase du corpus dans le dépôt : les tests utilisent des exemples écrits pour l'occasion.

## Hors périmètre
Le catalogue et l'anti-doublon des packs (P6-01), l'aide au paiement (message fixe de la plateforme), l'alerte sur un fan laissé sans réponse (supervision).
