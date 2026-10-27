# Écarts entre la méthode de chatting et le code de l'agent

Statut : proposed
Phase : 3
Dépend de : P3-02 (mémoire du fan), P6-01 (catalogue des scripts) pour une partie des écarts
Branche : task/<id>-method-gaps

## Objectif

Confronter chaque règle de la méthode de chatting qui fait foi (document hors dépôt, tenu par Charles) au code de l'agent, et dire pour chacune où elle est appliquée, si elle manque ou si elle est appliquée autrement. Aucune phrase du document n'est recopiée ici (ADR 0010) : les règles sont reformulées.

## Contexte à lire

- `apps/api/src/modules/agent/domain/policy.ts`, `hold.ts`, `guards.ts`, `traps.ts`, `situation.ts`
- `apps/api/src/modules/agent/infra/compose.ts`, `draft-composer.ts`, `fan-limits.ts`
- `packages/contracts/src/persona.ts` (`strategies`, `follow_ups`), `packages/contracts/src/fans.ts` (limites du fan)
- `packages/llm/prompts/brain/default.md`, `packages/llm/prompts/voice/default.md`

## État au 27/10 (main ac74188)

Légende : **appliquée** (code et test), **partielle**, **manquante**, **autrement** (appliquée d'une autre façon que la méthode).

### Sécurité

| Règle reformulée | État | Où |
|---|---|---|
| Un mineur possible : un humain prend la main, l'âge n'est plus confirmé | appliquée | `hold.ts` (`holdDecision`, `protectionFor`), `fan-limits.ts`, `draft-composer.ts` ; tests `hold.test.ts`, `draft-composer.test.ts` |
| Détresse, idées noires, récit de violences réelles, menace : un humain, plus rien d'écrit | appliquée | `hold.ts` (`HANDOFF_RISKS`, `STOP_SIGNS`) ; tests idem |
| Médias toujours regardés avant de répondre, sinon un humain | appliquée | `draft-composer.ts` (`seeHisMedia`) ; `media-sight.test.ts`, `draft-composer.test.ts` |
| Le message du fan est une donnée, pièges et injections refusés | appliquée | `injection.ts`, `traps.ts` ; `injection.test.ts`, `traps.test.ts`, évals |
| Elle ne dit jamais qu'elle est une IA | appliquée | garde `ai_disclosure` (`guards.ts`, ADR 0021) ; `guards.test.ts` |

### Relation

| Règle reformulée | État | Où |
|---|---|---|
| Jamais de déclaration d'amour | appliquée | garde `love_declaration` ; `guards.test.ts` |
| Jamais de rencontre concrète ; un « un jour peut-être » vague reste permis | appliquée | garde `meeting_promise` (rencontres concrètes seulement) ; `guards.test.ts` |
| Petits noms pris dans une liste fermée | appliquée (souple) | garde `pet_name` sur `behavior.pet_names` ; `guards.test.ts` |
| Ne jamais laisser un fan sans réponse, toujours dire au revoir | partielle | relances aux délais de la persona (P3-10 : `conversation.follow_up`, `followUpDecision`) ; « dire au revoir » reste au prompt |

### KYC et sexualisation

| Règle reformulée | État | Où |
|---|---|---|
| Apprendre prénom, âge, métier, passions, situation, ville | partielle | le cerveau liste ce qui manque (`kycMissing`, prompt `brain`) ; aucune règle de code ne s'en sert |
| Rien d'explicite avant un âge connu et majeur | partielle | une offre exige `ageConfirmedAt` (`offerDecision`, `policy.test.ts`) ; le texte de la voix, lui, n'a aucune garde quand l'âge n'est pas confirmé |
| Elle ouvre la sexualisation seulement après un délai réglé dans le CRM | manquante | `strategies.sexualization.initiate_after_hours` existe dans le schéma de persona mais n'est lu nulle part |
| Elle suit un fan qui sexualise seulement après un minimum de KYC ; avant, elle le recadre avec sa voix | manquante | `strategies.kyc.min_hours_before_following` existe dans le schéma mais n'est lu nulle part |

### Vente

| Règle reformulée | État | Où |
|---|---|---|
| Au plus un script par fan sur le délai réglé (10 h par défaut) | autrement | `offerDecision` (`cooldownHours` lu dans `strategies.script_launch.cooldown_hours`) est testé mais **n'est appelé que par les évals** : en production, si le cerveau propose `offer`, la voix écrit l'offre sans que la règle soit consultée |
| Une offre suit sa chaleur, ne l'ouvre jamais ; il peut demander lui-même | autrement | même fonction, même constat |
| Rien après un manque d'argent avoué, jusqu'à ce qu'il revienne de lui-même au payant | partielle | le risque `money_trouble` bloque l'offre du tour (`NO_SALE_RISKS`) ; il n'est **pas gardé** : au message suivant, plus rien ne s'en souvient (`protectionFor` ne pose pas `salesFrozen`) |
| Jamais reproposer un pack refusé | partielle | `offerableScripts` existe et est testé ; aucun appelant, faute d'historique des scripts Reveal (P6-01) |
| Jamais renvoyer un script déjà reçu | manquante | dépend du même historique (P6-01, ADR 0018) |
| Dossier Jour ou Nuit choisi par l'heure chez elle | partielle | `situation.ts` (`dayPart`, `isNight`) ; le choix du dossier attend le catalogue (P6-01) |
| Jamais de négociation ni de remise | partielle | seulement dans le prompt (`brain` : les prix sont décidés par des règles) ; aucune garde sur le texte de la voix |
| Aider à payer en une phrase ; « je dois payer ? » est un signal d'achat | partielle | `offerSignals` lit `asks_for_media` ; « je dois payer ? » n'est pas un signal distinct |
| Première offre pas avant un certain temps après son premier message | manquante | aucune règle sur la première offre |

### Après un refus, après un achat

| Règle reformulée | État | Où |
|---|---|---|
| Après un refus : comprendre, insister un peu, bouder une fois, lâcher | partielle | `maySulk` (pas de bouderie si ventes gelées, fan fragile ou à ne plus contacter) est testé mais **sans appelant** ; la garde `guilt_trip` (souple) lit la culpabilisation |
| Pas de bouderie après un achat, ni avec un fan qui a parlé d'argent, de ses limites ou de détresse | partielle | `maySulk` ne lit ni l'achat récent ni le manque d'argent du tour |
| Après chaque achat, de l'attention, pas de nouvelle vente tout de suite | manquante | aucun signal d'achat dans le chemin de l'agent (attend les événements de vente de Reveal) |
| Relance automatique tous les X jours, au plus deux relances de vente | partielle | relances de lien aux délais de `follow_ups` (P3-10) ; aucune relance ne vend tant que l'historique des scripts manque (P6-01), `post_offer.delay_days` non lu |

### Mémoire du fan

| Règle reformulée | État | Où |
|---|---|---|
| Une note par fan : identité, phase, ventes, sécurité, faits datés | partielle | faits proposés par le cerveau et gardés par `fans` (P3-02) ; la partie « ventes » attend l'historique Reveal ; Reveal fait foi pour la note (ADR 0018) |

## À faire

Dans la zone de l'agent, sans capture ni clé (PR à part) :

- [x] Brancher `offerDecision` sur le chemin réel : quand la règle refuse, la voix reçoit une réponse sans rien à vendre, et sans les limites du fan ou l'historique des offres aucune offre n'est écrite.
- [x] Garder le manque d'argent : `money_trouble` pose `salesFrozen` (raison `money_trouble`) par la politique ; les offres reprennent seulement s'il revient de lui-même au payant.
- [x] Garde de la voix sur la négociation et la remise (`discount`).

Le gel `money_trouble` ne s'efface jamais de lui-même, même après un achat : seul un humain le lève, et d'ici là une offre ne part que s'il redemande du payant de lui-même. C'est conforme à la méthode, et c'est un point d'entrée pour P6-01 et pour les relances : un fan gelé ne reçoit aucune relance de vente.

Hors zone ou en attente (nouvelles fiches à décider avec Charles) :

- [x] Curseur de sexualisation, minimum de KYC, rien d'explicite avant l'âge confirmé : `P3-09-sexualization-cursor.md`.
- [x] Relances et « jamais sans réponse » : `P3-10-follow-ups.md` (partage avec Bilan pour le worker).
- [ ] Scripts déjà reçus, packs refusés, dossier Jour / Nuit, première offre, attention après achat : après P6-01.

## Critères d'acceptation

- Chaque ligne « manquante » ou « autrement » a une PR fusionnée ou une fiche qui la porte.
- `pnpm check` et `pnpm test` verts.

## Hors périmètre

Le texte de la méthode elle-même, les prompts de vente propres à Messa, tout ce qui demande la capture Reveal.

## Notes de session

27/10 : audit fait par le fil agent sur main ac74188. Les trois points de la zone agent sont corrigés dans une PR à part ; tant que l'historique des scripts Reveal n'existe pas (P6-01), l'agent réel ne propose aucune offre.
