# Curseur de sexualisation, minimum de KYC et âge confirmé

Statut : proposed
Phase : 3
Dépend de : P3-02 (limites du fan), `PROPOSED-method-gaps.md`
Branche : task/<id>-sexualization-cursor

## Objectif

Faire appliquer par le code, jamais par le prompt, les trois réglages de la méthode qui existent dans la fiche persona sans être lus : quand elle ouvre la sexualisation, quand elle suit un fan qui la lance, et rien d'explicite tant que son âge n'est pas confirmé.

## Contexte à lire

- `packages/contracts/src/persona.ts` : `strategies.sexualization.initiate_after_hours`, `strategies.kyc.min_hours_before_following`
- `apps/api/src/modules/agent/domain/situation.ts` (durée de la relation), `policy.ts`, `traps.ts` (le modèle d'une consigne remplacée par le code)
- `apps/api/src/modules/agent/infra/compose.ts` (`offerRefusal`, la consigne remplacée quand la politique refuse)
- `docs/sessions/tasks/PROPOSED-method-gaps.md`

## À faire

- [ ] Une règle pure `sexualizationDecision` (domaine de l'agent) : à partir de la durée de la relation, des limites du fan et de la lecture du cerveau, elle dit « elle peut ouvrir », « elle suit », ou « elle recadre ».
- [ ] Avant `initiate_after_hours`, une consigne du cerveau qui ouvre la sexualisation est remplacée par une réponse sans sous-entendu.
- [ ] S'il sexualise avant `min_hours_before_following`, ou tant que son âge n'est pas confirmé, la voix reçoit une consigne de recadrage dans sa voix (elle ralentit, revient à lui), comme pour un piège.
- [ ] Une garde de la voix sur le vocabulaire explicite, bloquante tant que `ageConfirmedAt` manque.
- [ ] Le playground suit la même règle (horloge simulée, `advance`).
- [ ] Tests unitaires sur chaque seuil, scénarios d'évals sur le recadrage.

## Question pour Charles

Qui confirme l'âge ? Aujourd'hui seul un humain pose `ageConfirmedAt` : sans lui, l'agent n'écrit rien d'explicite et ne vend rien. Recommandation : un âge de 18 ans ou plus dit clairement par le fan, sans aucun signe de mineur (texte ou média), le confirme par la politique (auteur `system`, retirable par un humain et retiré par le code au moindre signe de mineur, comme aujourd'hui).

## Critères d'acceptation

- `pnpm check`, `pnpm test` verts ; un scénario d'évals par seuil.

## Hors périmètre

Les relances (`PROPOSED-follow-ups.md`), les scripts (P6-01).

## Notes de session
