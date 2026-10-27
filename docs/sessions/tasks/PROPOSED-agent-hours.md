# Heures d'activité de l'agent, par créatrice
Statut : proposed (ID à donner par Charles ; née de l'étude de Desirely du 27/10)
Phase : 3
Dépend de : P3-10 (relances, heures calmes), EQ-02 (planning, hybride), ADR 0025
Branche : task/<id>-agent-hours

## Objectif
Charles règle, créatrice par créatrice, les créneaux pendant lesquels l'agent peut écrire ; hors créneau l'agent se tait, garde les messages et y répond à la reprise.

## Contexte à lire
`apps/api/src/modules/agent/domain/follow-up.ts` (heures calmes 23 h – 9 h en dur), `situation.ts` (Jour / Nuit 22 h – 7 h en dur), `apps/api/src/modules/conversations/domain/rules.ts` (`debounceFor`), EQ-02, ADR 0025, `docs/reference/desirely-analysis.md` (§ Horaires).

## Ce que fait Desirely
Onglet Horaires par modèle : fuseau d'abord, mode 24/7 par défaut ou créneaux jour par jour (ex. lundi 9 h – 23 h), chaque créneau activable sans être supprimé. Hors créneau, ni réponse ni relance ; les messages reçus sont repris à la reprise. Raison donnée : une créatrice qui répond tous les jours à 4 h du matin éveille les soupçons, et des plages restent aux humains.

## À faire
- [ ] Contrat `AgentHours` (fuseau de la créatrice, créneaux par jour, actifs ou non) ; valeur par défaut : 9 h – 1 h, pas 24/7.
- [ ] Les heures calmes des relances et la bascule Jour / Nuit deviennent des réglages lus au même endroit (aujourd'hui des constantes).
- [ ] Politique : hors créneau, `later` à l'ouverture du créneau suivant, jamais de brouillon ; à la reprise, réponse aux fans qui ont écrit, le plus ancien d'abord.
- [ ] Hybride : un chatteur en poste n'est pas borné par ces heures ; l'agent ne reprend que s'il est dans son créneau et que personne n'est en poste.
- [ ] Écran (Extension), dans Créatrices : semaine en lignes, créneaux en plages, l'heure qu'il est chez elle.

## Critères d'acceptation
- Tests : message reçu à 3 h, réponse à l'ouverture ; changement d'heure ; créneau désactivé ; chatteur en poste hors créneau.

## Hors périmètre
Le planning des chatteurs (EQ-02).

## Notes de session
