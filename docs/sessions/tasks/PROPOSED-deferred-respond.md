# Réponse différée après « attends, je reviens »

Statut : proposed
Phase : 3
Dépend de : P3-10 (relances, worker et moteur)
Branche : task/<id>-deferred-respond

## Objectif

Quand le fan écrit « attends, je reviens » ou « deux minutes », le cerveau choisit d'attendre (`action: 'wait'`). Le moteur rend alors `no_reply` (`hold.ts`), et `conversation.respond` écrit `reply_skipped`. Ensuite, plus rien ne se passe :

- aucune relance n'est programmée, puisque le worker ne programme qu'après un envoi d'elle (P3-10) ;
- « À traiter » ne montre pas la conversation, puisque le Dashboard ne la compte que dans `waiting`, sans l'ouvrir.

S'il ne revient jamais, son dernier message reste sans réponse. Cette fiche fait de l'attente une réponse différée et bornée, puis passe la main à un humain.

Ce n'est pas une relance : une relance (P3-10) suit **son** silence à lui, après une réponse d'elle. Ici, c'est elle qui n'a pas encore répondu à un message de lui.

## Contexte à lire

- `docs/architecture/message-flow.md` §1 (respond) et §4 (Relance)
- `apps/api/src/modules/conversations/application/jobs/respond.ts`, `application/follow-ups.ts` (programmer dans la transaction, `job_key`)
- `apps/api/src/modules/agent/domain/hold.ts` (`holdDecision`, cas `wait`)
- `apps/api/src/modules/supervision/infra/views/dashboard-reader.ts` (« À traiter », `waiting`)
- `packages/contracts/src/events.ts` (`reply_skipped`)
- `PROPOSED-method-gaps.md` (ligne « Alerte à l'opérateur sur tout fan qui écrit sans réponse »)

## Règles

1. **Le moteur dit quand revenir.** Un `wait` rend `no_reply` avec `retryAt`, borné par le code entre 10 et 60 minutes (point de départ : 20 minutes, à calibrer). Le cerveau ne fixe pas ce délai (CLAUDE.md, règle 3).
2. **Le worker reprogramme `conversation.respond`.** Il le fait sur la même file `conv:<id>`, avec la même clé `conversation.respond:<id>`, en mode `replace`, à `retryAt`. Un nouveau message du fan remplace naturellement ce job : il répond alors au nouveau message, sans rien à annuler.
3. **Au plus deux attentes de suite** pour le même dernier message du fan. Le compte vient du journal : les `reply_skipped` de raison `wait` depuis son dernier message entrant. À la troisième, c'est une passation (`handoff_requested`, cause à choisir dans le contrat), donc « À traiter ».
4. **Revérification sous verrou** comme pour `respond` : la conversation doit être au repos, aucune prise en main, aucune pause, les portes ouvertes. Sinon, rien n'est écrit.
5. **« À traiter »** montre aussi, au-delà de 30 minutes, une conversation dont le dernier message du fan n'a ni réponse, ni brouillon, ni job prévu. C'est un filet de sécurité pour tout trou futur, pas seulement pour `wait`.

## À faire

- [ ] Contrats (Bilan) : `reply_skipped` gagne `retryAt?` en ajout. `ComposeResult` ne change pas : `retryAt` existe déjà depuis #204.
- [ ] Agent : `holdDecision` (`wait`) → `retryAt` borné. Tests du domaine.
- [ ] Conversations (Bilan) : `respond` reprogramme sur `no_reply` avec `retryAt`, compte les attentes et passe la main à la troisième. Tests d'intégration : attente puis réponse, nouveau message pendant l'attente, trois attentes et passation, prise en main pendant l'attente.
- [ ] Supervision (Bilan) et Dashboard (Extension) : l'entrée « sans réponse depuis 30 minutes » dans « À traiter », avec un libellé en français.
- [ ] Doc : `message-flow.md` §1, glossaire si un terme naît.

## Critères d'acceptation

- Un « attends, je reviens » donne une réponse vers 20 minutes plus tard, s'il n'a rien écrit entre-temps.
- Un nouveau message pendant l'attente reçoit une seule réponse, pas deux.
- Trois attentes de suite font une passation, donc une entrée dans « À traiter ».
- `pnpm check`, `pnpm test` et `pnpm test:integration` sont verts.

## Hors périmètre

Les relances sur son silence (P3-10), les relances de vente (`PROPOSED-after-offer.md`), tout envoi réel.

## Notes de session

27/10 : proposée par Bilan, après la seconde passe méthode / code du fil Agent (#209).
