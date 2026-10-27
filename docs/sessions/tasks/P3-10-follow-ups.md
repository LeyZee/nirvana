# P3-10 Relances : un fan n'est jamais laissé sans réponse

Statut : todo (ID validé par Charles le 27/10 à 18h37)
Phase : 3
Dépend de : P0-05 (conversations), P3-02, `PROPOSED-method-gaps.md`
Branche : task/P3-10-follow-ups

## Objectif

Faire vivre les relances que la fiche persona décrit déjà (`follow_ups`, `strategies.post_offer.delay_days`) : relancer un fan resté silencieux, relancer une offre refusée au plus deux fois, et toujours dire au revoir.

## Constat (Bilan, 27/10)

Le job `conversation.follow_up` est déclaré dans les contrats, mais aucune tâche ne le traite dans la composition root, et les événements `follow_up_scheduled` et `follow_up_cancelled` n'ont aucun émetteur : tout le circuit manque.

## Partage

- Bilan (conversations, worker) : programmer une relance après le dernier message du fan, l'annuler quand il écrit ou qu'un humain reprend la main, faire passer la tâche par les mêmes verrous que `conversation.respond`, émettre les deux événements.
- Agent : décider si la relance part (limites du fan, ventes gelées, détresse, nombre de relances de vente déjà faites), et l'écrire par le même chemin qu'une réponse : cerveau, voix, gardes, brouillon à valider.

## À faire

- [ ] Bilan : planification, annulation, tâche, événements, tests d'intégration.
- [ ] Agent : règle pure `followUpDecision` (au plus deux relances de vente, aucune après un manque d'argent ou en détresse, délais de `follow_ups.delays_hours` et `post_offer.delay_days`) et son écriture en brouillon.
- [ ] Le playground montre la relance avec `advance`.

## Critères d'acceptation

- Une relance n'est jamais envoyée : elle devient un brouillon, comme toute réponse.
- `pnpm check`, `pnpm test`, `pnpm test:integration` verts.

## Hors périmètre

Les relances de masse, les vocaux.

## Notes de session
