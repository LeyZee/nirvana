# P3-14 Heures d'activité de l'agent, par créatrice
Statut : todo (ID validé par Charles le 27/10 à 20h37, carte « Les 5 sans capture, désir en tête »)
Phase : 3
Dépend de : P3-10 (relances, heures calmes), P3-11 (réponse différée, filet « Sans réponse »), EQ-02 (planning, hybride), ADR 0025
Branche : task/P3-14-agent-hours

## Objectif
Charles règle, créatrice par créatrice, les créneaux pendant lesquels l'agent peut répondre ; hors créneau l'agent se tait, garde les messages et y répond à la reprise. Les heures calmes des relances deviennent un réglage de la même page.

## Contexte à lire
`apps/api/src/modules/agent/domain/follow-up.ts` (heures calmes 23 h – 9 h en dur), `situation.ts` (Jour / Nuit 22 h – 7 h en dur), `apps/api/src/modules/conversations/domain/rules.ts` (`debounceFor`, `deferredRespondAt` borné à 5 – 25 min depuis #214), le filet « Sans réponse » de 30 min (#215), EQ-02 et `apps/web/src/scheduling/` (grille et mots du planning), ADR 0025, `docs/reference/desirely-analysis.md` (§ Horaires).

## Ce que fait Desirely
Onglet Horaires par modèle : fuseau d'abord, mode 24/7 par défaut ou créneaux jour par jour (ex. lundi 9 h – 23 h), chaque créneau activable sans être supprimé. Hors créneau, ni réponse ni relance ; les messages reçus sont repris à la reprise. Raison donnée : une créatrice qui répond tous les jours à 4 h du matin éveille les soupçons, et des plages restent aux humains.

## Règles
- **Deux réglages, un seul endroit.** Les créneaux de réponse (défaut 9 h – 1 h tous les jours, pas 24/7) et les heures calmes des relances (défaut 23 h – 9 h, la valeur actuelle) vivent ensemble dans `AgentHours`, à l'heure de la créatrice. Ils remplacent les constantes de `follow-up.ts`.
- **Répondre et relancer ne se règlent pas pareil.** Un fan qui écrit à minuit dans un créneau ouvert reçoit sa réponse ; personne ne reçoit une relance non sollicitée pendant les heures calmes, même si le créneau de réponse est ouvert. Une relance tombée hors créneau ou en heures calmes part à la première minute où les deux le permettent.
- **La bascule Jour / Nuit** du catalogue (22 h – 7 h, `situation.ts`) devient un réglage lu au même endroit, sans changer de sens.
- **Hors créneau, la conversation se repose.** Le `retryAt` de `respond` ne convient pas : `deferredRespondAt` le borne à 25 min et ignore un délai plus long. Il faut un mécanisme côté worker (Bilan) : aucun brouillon n'est fait, et une reprise est programmée à l'ouverture du créneau suivant ; à la reprise, l'agent répond aux fans qui ont écrit, le plus ancien d'abord, dans le plafond du jour.
- **Le filet « Sans réponse »** de 30 min (#215) se tait hors créneau ; il reprend son compte à l'ouverture, sinon toutes les conversations reçues la nuit y tomberaient.
- **Hybride** : un chatteur en poste n'est pas borné par ces heures ; l'agent ne reprend que s'il est dans son créneau et que personne n'est en poste (ADR 0025).

## À faire
- [ ] Contrat `AgentHours` (fuseau de la créatrice, créneaux de réponse par jour activables, heures calmes des relances, bascule Jour / Nuit) ; stockage en colonne jsonb validée par Zod sur `creators`, sans nouvelle table (Bilan attribue la migration).
- [ ] `follow-up.ts` et `situation.ts` lisent `AgentHours` au lieu de leurs constantes ; les valeurs par défaut reproduisent le comportement actuel.
- [ ] Politique : hors créneau, pas de brouillon ; reprise programmée par le worker ; filet « Sans réponse » muet hors créneau.
- [ ] Écran (Extension), dans Créatrices, réservé au propriétaire (onglet et adresse, leçon de #217) : la grille et les mots du planning EQ-02 (« 9 h – 1 h » avec espaces insécables, « jusqu'au lendemain »), un en-tête qui dit le fuseau lu (« À l'heure de Nora (Paris) », car le planning se lit à l'heure de l'agence et ces heures à celle de la créatrice), un créneau désactivé grisé en encre pâle, jamais rouge.

## Critères d'acceptation
- Tests : message reçu à 3 h, réponse à l'ouverture ; message reçu à minuit dans un créneau ouvert, réponse immédiate mais aucune relance avant 9 h ; changement d'heure ; créneau désactivé ; chatteur en poste hors créneau ; filet « Sans réponse » muet la nuit ; sans réglage, comportement identique à aujourd'hui.
- Écran : Nuit et Jour, 1 440 et 400 px, mouvement réduit, état « Le serveur ne répond pas ».

## Hors périmètre
Le planning des chatteurs (EQ-02).

## Notes de session
