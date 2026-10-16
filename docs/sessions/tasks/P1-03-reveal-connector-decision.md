# P1-03 Décision B/C et spécification du connecteur Reveal

Statut : todo
Phase : 1
Dépend de : P1-02
Branche : task/p1-03-reveal-connector-decision

## Objectif
Confirmer ou amender ADR 0008 à la lumière de P1-02, et écrire la spécification du `RevealApiConnector` (ou `RevealBrowserConnector`) assez précise pour que les fiches P2 soient mécaniques.

## Contexte à lire
ADR 0008, `connectors.md`, `reveal-api-observed.md` (rempli), `threat-model.md` (bannissement, détection), CGU Reveal (lues par Charles, résumé à demander).

## À faire
- Tableau de faisabilité B : auth rejouable depuis un serveur ? signatures reproductibles ? anti-bot sur l'API ? durée de session ? invalidation ?
- Si B est faisable : spécification du client (endpoints, mappage vers `ExternalMessage`/`ConversationSnapshot`, détection des ventes, upload média, `verifySent`, rythme, egress), plan de capture de session (ce que l'extension doit lire exactement).
- Si B est bloqué : ADR nouvelle (`proposed`) qui bascule sur C avec son coût (navigateur persistant, profil, mémoire), et spécification équivalente.
- Dans les deux cas : liste des risques et des signaux de détection à surveiller, et comment l'enregistreur servira à détecter les changements d'API.
- Découper la phase 2 en fiches P2-01… (session + capture, lecture, envoi manuel, réconciliation, runbooks testés, déploiement).

## Critères d'acceptation
- ADR 0008 `accepted` confirmée (note datée) ou nouvelle ADR `proposed` avec justification chiffrée.
- Fiches P2 créées avec critères d'acceptation ; index mis à jour.
- Résumé des clauses CGU pertinentes consigné dans `reveal-api-observed.md` (section Juridique), avec la décision de Charles.

## Hors périmètre
Code du connecteur.

## Notes de session
