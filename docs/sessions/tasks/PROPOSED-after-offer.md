# Après une offre : refus, achat, aide au paiement, relances de vente

Statut : proposed
Phase : 6
Dépend de : P6-01 (historique des scripts, des offres et des ventes Reveal), P3-10
Branche : task/<id>-after-offer

## Objectif

Appliquer en code ce que la méthode de chatting (document hors dépôt, tenu par Charles) demande autour d'une offre, une fois que Nirvana sait quelle offre est partie, laquelle a été refusée et laquelle a été achetée. Les règles sont reformulées ici, aucune phrase du document n'est recopiée (ADR 0010).

## Contexte à lire

- `PROPOSED-method-gaps.md` (état au 27/10 soir), `P6-01-sales-catalog.md`, `P3-10-follow-ups.md`
- `apps/api/src/modules/agent/domain/policy.ts` (`offerDecision`, `maySulk`, `offerSignals`), `follow-up.ts`, `hold.ts`
- `apps/api/src/modules/agent/infra/compose.ts`, `draft-composer.ts`
- `packages/contracts/src/persona.ts` (`strategies.post_offer`, `strategies.script_launch`)

## Règles à porter

1. **Rythme des offres** : au plus un certain nombre d'offres à un fan par jour, et au plus un certain nombre d'offres sans achat avant de s'arrêter jusqu'à ce qu'il revienne de lui-même vers le payant. Ce sont deux réglages du CRM par créatrice ; les points de départ (3 et 5) viennent du corpus et restent à calibrer. Le délai entre deux scripts (`script_launch.cooldown_hours`) se branche ici par `lastOfferAt`.
2. **Après un refus**, dans l'ordre : demander ce qui ne lui a pas plu, insister un peu, bouder une fois au plus (`maySulk`), puis lâcher. La bouderie commence joueuse ; jamais juste après un achat, jamais avec un fan qui a parlé d'argent, de ses limites, de détresse, ni avec un fan fragile ou gelé.
3. **Après un achat** : attention et tendresse à chaque fois (aftercare), sans en faire trop ; pas de nouvelle offre ni de bouderie juste après.
4. **Aide au paiement** : quand il bloque sur le moyen de payer, un message d'aide fixe (ce que contient le pack, son prix, comment l'ouvrir), puis un humain si ça bloque encore. Une question sur le fait de devoir payer est un signal d'achat : elle reçoit une réponse franche.
5. **Relances de vente** : après une offre refusée ou restée sans réponse, au plus deux relances de vente, au délai de `post_offer.delay_days` ; aucune pour un fan gelé, fragile ou en détresse. Elles passent par `conversation.follow_up` et par `offerDecision`.

## À faire

- [ ] Contrats : deux réglages de persona (offres par jour, offres sans achat), bornes et formulaire Réglages (accord de Bilan pour `contracts`, d'Extension pour l'écran).
- [ ] Politique : `offerDecision` lit le rythme ; `refusalStep` (comprendre, insister, bouder, lâcher) ; `afterPurchase` ; `salesFollowUpDecision`. Tout en règles pures testées.
- [ ] Composeur : brief fixé par le code à chaque étape (refus, aftercare, aide au paiement), comme le recadrage et les relances.
- [ ] Évals : fan qui refuse, fan qui achète, fan qui ne sait pas payer, fan qui demande s'il doit payer.

## Critères d'acceptation

- Tests du domaine : 4e offre du jour refusée, 6e offre sans achat refusée, une seule bouderie par refus, jamais de bouderie ni d'offre juste après un achat, deux relances de vente au plus, aucune pour un fan gelé.
- `pnpm check`, `pnpm test`, `pnpm test:integration` verts.

## Hors périmètre

Le catalogue et la synchronisation des scripts (P6-01), les textes de vente propres à Messa, tout envoi réel.

## Notes de session

27/10 : proposée par le fil agent après la passe méthode / code sur main 5a3e09d.
