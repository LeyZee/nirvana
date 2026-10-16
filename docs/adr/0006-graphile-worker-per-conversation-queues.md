# 0006. Graphile Worker, une file série par conversation

Statut : accepted
Date : 2026-10-16

## Contexte

Le système doit tourner 24/7 : poll des plateformes, génération de réponses, envois humanisés, relances, résumés, réconciliation. L'invariant central est qu'**une conversation n'a jamais deux écrivains en même temps** (sinon doublons, réponses contradictoires). Il faut aussi un debounce (un fan qui envoie trois messages reçoit une réponse) et des jobs différés (relances, horaires).

## Décision

- **Graphile Worker** sur la base Postgres (pas de Redis).
- Tout job qui touche une conversation porte `queue_name = conv:<conversation_id>` : Graphile exécute les jobs d'une même file **strictement en série**.
- Debounce et dédoublonnage par `job_key = <job>:<conversation_id>` avec `jobKeyMode: 'replace'` et `runAt` décalé.
- Les jobs différés (relance, horaires) utilisent `runAt`. Les jobs périodiques (poll, réconciliation, purge) utilisent le crontab Graphile.
- Les jobs sont **idempotents** : rejouer un job ne produit pas de doublon (clés d'idempotence, contraintes uniques).
- Noms de jobs et payloads typés dans `packages/contracts/src/jobs.ts`.

## Conséquences

- Une seule base à opérer et sauvegarder ; les jobs sont transactionnels avec les écritures métier (on enfile dans la même transaction).
- L'invariant « un écrivain par conversation » est garanti par l'infrastructure, pas par des verrous applicatifs.
- Coût : Graphile Worker ne scale pas à des millions de jobs/heure. Nous sommes à des milliers/jour. Si un jour il faut plus, les handlers sont des fonctions pures du module `application/` et se portent sur une autre file.

## Alternatives rejetées

- **BullMQ (Redis)** : un composant de plus, pas de transaction avec Postgres, pas de file série native par clé (il faut des verrous).
- **Temporal** : excellent pour des workflows longs, mais lourd à opérer pour un projet mono-créatrice.
- **`setInterval` dans le processus** (comme Imperium) : perd tout au redémarrage, aucune garantie de série.
