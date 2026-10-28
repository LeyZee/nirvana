# 2026-10-28 — EQ-05 Écrans de paie et Commissions du chatteur — in_progress
Fait :
- Paie, sous-onglets de l'ADR 0024 dans `SubNav` : Quinzaine (« À verser » ou le net et sa prévision, l'écart, l'objectif, la répartition des ventes, une ligne par membre, « Valider (n) » relevé par relevé, les blocages au-dessus de la liste, le cadenas d'une quinzaine close, l'export CSV), le Relevé (le parcours de l'argent compte par compte, les règles repliées, « Valider la révision n », « Marquer payé » en deux temps, « Ajuster »), Relevés (l'index), Primes et malus (« Ajouter » en deux temps, « Annuler » après confirmation, une saisie annulée barrée) et Objectifs (l'objectif sur sa jauge avec la marque de la prévision, les paliers en vigueur et ceux qui suivent).
- Le minimum de versement dans Réglages › Règles de paie.
- Commissions (chatteur) : le héros est l'argent en route, calculé, en validation, validé ou payé, sans date de versement promise. Puis « Le parcours de ton argent », « Ma performance » (le palier suivant en net et en ventes approchées sur le compte qui rapporte le plus, l'objectif d'équipe en pourcentage seul) et « Mes relevés », chacun ouvert à la deuxième personne. Un chatteur ne demande plus la liste de l'équipe.
- `reports.css` : la marque droite de `rp-notice`, `rp-account` neutre, un seul formateur signé.
- Recalage sur l'API finale (#279) : les deux refus qui manquaient (`pay_period_not_computed_conflict`, `payment_before_period_unprocessable`) ; « Marquer payé » refuse avant l'envoi un jour d'avant la quinzaine (`min` du champ) et une référence qui contient un IBAN (`containsIban`, la règle du contrat) ; une quinzaine d'avant la première clôture de l'équipe (`beforeFirstClosing`) se dit close sans relevé, avec un cadenas, sans somme ni faux « Payée ».
- Finition d'après les captures : un relevé long s'ouvre en haut (`Dialog` focalise sans défiler), l'onglet actif de `SubNav` suit un compteur arrivé après lui, le pied d'un relevé, la marge d'un panneau sans titre, et un seul « Valider » à la fois (en-tête au bureau, ligne de sélection au téléphone ; la règle perdait contre `nv-btn`).
Pas fait : rien dans cette fiche ; la PR attend la relecture d'Extension et de Bilan.
Décisions :
- Commissions s'ouvre sur la plus ancienne quinzaine finie dont l'argent n'est pas encore versé. Sinon sur la quinzaine en cours dès qu'elle a un relevé, sinon sur la dernière payée.
- « Ma performance » porte toujours sur la quinzaine en cours. Un manager en congé, qui a le rail du chatteur, n'y voit pas l'objectif d'équipe (pas de prime collective pour lui).
- Pendant la quinzaine, un total sous le minimum se dit au conditionnel (« si la quinzaine finit ainsi »). Le héros montre l'à-verser du moteur, comme « Mes relevés ».
- Les ventes à faire sont un repère, arrondi à l'unité supérieure, jamais un chiffre de paie.
- Chez le chatteur, la prévision de l'objectif collectif prolonge le pourcentage atteint au rythme de la quinzaine : il ne lit jamais le net de l'équipe (`netMinor` à `null` pour lui).
Découvertes :
- L'API pourrait donner la quinzaine du relevé qu'un ajustement corrige. Aujourd'hui l'écran la cherche dans la quinzaine lue et la précédente, sinon il dit « corrige un relevé déjà validé ».
- La prévision de l'objectif chez le chatteur prolonge tout le pourcentage atteint au rythme, rapports tardifs des autres compris, puisqu'il ne les lit pas : l'API pourrait donner la part tardive en pourcentage.
- Le résumé d'une quinzaine (`GET /v1/payroll/periods`) ne porte pas la date de paiement, que « Mes relevés » aimerait dire.
Candidats à suppression : aucun.
Vérifié : `pnpm check` ✓ ; tests web ✓ (dont 5 d'écran pour Commissions, 6 du modèle et un pour `SubNav`) ; 70 captures des vrais écrans relues (données inventées, ADR 0010), galerie https://claude.ai/artifact/2GBd9MF6gJQnPJ1jgqZfY6.
