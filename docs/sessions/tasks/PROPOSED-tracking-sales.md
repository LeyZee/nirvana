# Suivi enrichi, page Ventes et mémoire du fan corrigible
Statut : proposed (ID à donner par Charles ; née de l'étude de Desirely du 27/10)
Phase : 4 (supervision)
Dépend de : `PROPOSED-tracking-reader.md` (lecteur), P6-01 (`script_runs`, `sales`), P3-02 (mémoire du fan), ADR 0023
Branche : task/<id>-tracking-sales

## Objectif
Dans le Suivi, voir d'un coup d'œil où en est chaque fan (phase, désir, scripts vus sur le total, dépensé, prochaine étape) et agir sur plusieurs conversations à la fois ; une page Ventes dit qui a vendu quoi, l'agent ou un humain ; la mémoire du fan se corrige à la main.

## Contexte à lire
`apps/web/src/screens/tracking/view.ts`, `PROPOSED-tracking-reader.md`, P6-01, ADR 0023 (la créatrice ne voit ni conversation ni fan), ADR 0025, `docs/reference/desirely-analysis.md` (§ Conversations, § Transactions).

## Ce que fait Desirely
Page Conversations : colonnes Désir (neutre, joueur, acheteur), Scripts « x / y », dernier message, état de l'IA ; fiche du fan à droite ; sélection multiple pour couper ou rendre l'IA. Panneau Mémoire éditable. Page Transactions : date, fan, montant, script, étape, vendu par l'IA ou non.

## À faire
- [ ] Phase et désir, en deux colonnes, calculés par une règle pure côté serveur (jamais par le modèle ni par l'écran) : la phase à partir du curseur de sexualisation et des `script_runs` (découverte, sexualisation, vente, après-vente) ; le désir est la bande de la note de désir (`PROPOSED-desire-score.md` : neutre, joueur, chaud), jamais recalculée ici.
- [ ] Colonnes : scripts vus / scripts proposables, total dépensé, prochaine étape prévue (relance, script, attente), lien direct vers la conversation Reveal.
- [ ] Actions en masse (propriétaire et manager) : rendre la main, reprendre, mettre en pause l'agent, marquer comme traité ; une action, une ligne de journal par conversation.
- [ ] Mémoire du fan : corriger, ajouter ou retirer un fait, avec auteur et date ; un fait corrigé à la main prime sur ce que l'agent déduit ensuite ; la note Reveal reste la source (ADR 0018).
- [ ] Page Ventes (propriétaire) : vente confirmée par la plateforme, créatrice, script et étape, auteur (agent, chatteur, inconnu), montant brut et net estimé ; aucune vue chez la créatrice (ADR 0023).

## Critères d'acceptation
- Tests : action en masse rejouable sans double effet ; un fait corrigé n'est pas écrasé ; une créatrice ne lit ni Ventes ni Suivi.
- Rendu à 1 440 px et 400 px ; zéro bruit (un seul rouge : ce qui attend un humain).

## Hors périmètre
Le calcul des commissions (Paie, EQ), les messages de masse.

## Notes de session
