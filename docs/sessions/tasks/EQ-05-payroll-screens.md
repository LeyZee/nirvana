# EQ-05 Paie : écrans de validation, de paiement et commissions du chatteur
Statut : todo, conçue (fiche reprise et maquettes faites le 28/10/2026, relecture d'Extension demandée) ; le code commence quand #259 et les lots 3a à 3e d'EQ-04 sont dans main (lot 3 de l'ADR 0023, ID validé par Charles le 27/10/2026)
Phase : équipe (ADR 0023)
Dépend de : EQ-04 (lot 3 : validation, saisies, paiement, règles, taux) ; EQ-11 (fait)
Branche : task/eq-05-payroll-screens

## Objectif
Valider et payer les paies depuis l'onglet Paie, à la place que fixe l'ADR 0024, et laisser chaque chatteur suivre ses commissions, période par période, ligne par ligne.

## Contexte à lire
`docs/adr/0023-team-management.md` (§ Paie, § Factures pour « payée »), `docs/adr/0024-roles-and-navigation.md`, `docs/adr/0032-pay-period-closing.md`, l'ADR 0033 (source des taux, proposée ; elle arrive avec le lot 3e), `apps/api/src/modules/payroll/README.md`, `packages/contracts/src/payroll.ts`, `docs/design/README.md`, `packages/design-system/README.md`, `docs/conventions/api.md`. Maquettes : https://claude.ai/artifact/XYE7FJob2hX9fkssZ8Yz5T (Nuit et Jour, 1 440 et 390 px, mouvement réduit).

## Ce que l'API donne déjà (EQ-04)
| Route | Qui | Ce que l'écran en fait |
| --- | --- | --- |
| `GET /v1/payroll/periods/:period` | tous (le sien pour un membre) | Quinzaine, relevé, objectifs : relevés avec leurs lignes, règles copiées, `team`, `canValidate`, `revision`, `computedAt`, clôture, paliers, objectif, minimum |
| `POST /v1/payroll/statements/:id/validate` `{ revision }` | propriétaire, manager actif, jamais le sien | « Valider » et « Valider (n) » |
| `POST /v1/payroll/statements/:id/pay` `{ revision }` | propriétaire | « Marquer payé » (voir le premier manque) |
| `POST /v1/payroll/bonuses`, `/penalties`, `/adjustments`, `…/:id/cancel` | propriétaire, manager actif, jamais pour soi | Primes et malus |
| `POST /v1/payroll/bonus-tiers`, `POST /v1/payroll/collective-goals` | propriétaire | Objectifs |
| `GET`, `PUT /v1/payroll/settings` | lecture : tous ; écriture : propriétaire | Minimum de versement, dans Réglages › Règles de paie |
| `GET /v1/payroll/exchange-rates` | tous | Le dernier taux de la BCE, au survol d'une ligne en dollars |
| `GET /v1/team/members`, `GET /v1/team/pay-rules`, `GET /v1/scheduling/shift-reports?period=` | agence | Noms et couleurs (`validatedBy` et `paidBy` sont des `userId`), comptes et créatrices d'une ligne, rapports derrière une ligne |

## Ce qui manque à l'API (dans cette fiche ; contrats et base par Bilan)
1. **Les détails du paiement.** L'ADR 0023 (§ Factures) veut que « payée » porte la date, le moyen, la référence du transfert et le montant envoyé, et EQ-06 rattache ce transfert aux factures qu'il solde. Or `POST …/pay` ne prend que `{ revision }`, et la table n'a que `paid_at` et `paid_by`. À faire : une migration (numéro attribué par Bilan), en ajout seul, et le corps `{ revision, paidOn, method, reference, sentMinor }`, `method` dans une liste fermée. L'écran remplit « Montant envoyé » avec « À verser ». Un autre montant se confirme, puis s'affiche en ambre sur le relevé, sans changer le relevé. Question à Charles, avec un défaut : les moyens de paiement de l'agence (défaut : virement, Wise, PayPal, autre).
2. **L'index des quinzaines.** `GET /v1/payroll/periods?before=&limit=`, par curseur.
   - Pour l'agence : chaque quinzaine, finie ou non, sa clôture, le nombre de relevés par statut et le total à verser.
   - Pour un membre : son relevé résumé.
   - Sans cette route, « Relevés » et « Mes relevés » liraient les quinzaines une à une.
3. **Le relevé après une validation de rapports.** Le brouillon ne se recalcule qu'à l'heure (`payroll.recalculate_open`), ou en file après un refus `commission_statement_changed_conflict`. L'écran dit « Calculé à 10 h 07 » sous la liste et dans le relevé. Après ce refus, il relit le relevé jusqu'à la révision suivante, et ne revalide jamais tout seul. À trancher avec Bilan : mettre `payroll.recalculate` en file quand un rapport est validé.

L'export CSV d'une quinzaine se fait dans le navigateur, depuis la lecture de la quinzaine : mêmes données, aucune route ni aucun droit nouveau. L'export comptable reste à EQ-06, côté serveur.

## Écrans
Paie (propriétaire et manager) a les sous-onglets de l'ADR 0024, dans son ordre : Quinzaine · Relevés · Primes et malus · Objectifs. Factures et Export comptable arrivent avec EQ-06 : un onglet n'apparaît que quand son écran existe. Chez le chatteur, l'écran est Commissions.

- [ ] **Quinzaine** (la période en cours, ou celle choisie dans Relevés).
  - En-tête : les dates, un état qui dit qui a la main (« En cours, finit le 31 oct. », « Finie : à valider », « Close le 3 nov. par Charles »), et la quinzaine précédente ou suivante.
  - Le chiffre qui domine : « À verser » quand la quinzaine est finie, sinon le net de l'équipe et sa prévision de fin. Au plus trois chiffres secondaires : prévision, écart avec la quinzaine précédente, objectif collectif.
  - Une ligne par membre : couleur, nom, rôle, net, total, état, écart. États : Brouillon, Validé, Payé, Reporté (sous le minimum, en ambre).
  - Sélection et « Valider (n) » en néon. Le relevé du lecteur a sa case éteinte, comme son propre rapport dans Équipe › Rapports, et dit « Ton relevé : un autre membre de l'agence le valide ».
  - Ce qui bloque la validation, en ambre et au-dessus de la liste, avec le lien qui le lève : rapports à relire (Équipe › Rapports), taux de la BCE manquant, membre sans taux de commission (Équipe › Membres).
  - Une fois la quinzaine close, un cadenas : « Close le … : un rapport validé maintenant va sur la quinzaine suivante ».
  - Il n'y a pas de route de lot. « Valider (n) » envoie relevé par relevé, dans l'ordre des membres. Chaque refus reste sur sa ligne, et les autres relevés passent.
- [ ] **Relevé** (panneau ouvert depuis une ligne) : le parcours de l'argent.
  - Compte par compte : brut dans la devise, en euros au taux de la BCE du jour (au survol), hors TVA, net de la plateforme, commission au taux du membre.
  - Puis : palier, objectif collectif, part d'équipe d'un manager, primes, malus (demandé et retenu, avec le plafond), reports reçus, ajustements, total, report sortant, « À verser ».
  - Replié par défaut : les règles copiées, la révision, « Calculé à », la version du moteur, les rapports derrière chaque compte.
  - Actions :
    - « Valider (révision n) » ;
    - « Marquer payé », propriétaire seul, en deux temps (remplir, relire) ;
    - « Ajuster », sur un relevé validé ou payé (l'ajustement va sur la quinzaine que choisit le serveur, et l'écran la dit avant l'envoi).
- [ ] **Relevés** : les quinzaines, de la plus récente à la plus ancienne (index du deuxième manque). Chacune montre son état, son total à verser et le nombre de relevés par statut, et s'ouvre en Quinzaine, en lecture pour une quinzaine close.
- [ ] **Primes et malus** : les saisies de la quinzaine, membre par membre, et une saisie annulée reste barrée.
  - « Ajouter » en deux temps (remplir, relire) : prime, malus fixe, malus en pourcentage ou ajustement ; le membre (jamais soi : son nom n'est pas dans la liste) ; la quinzaine ; le montant ; le motif, obligatoire.
  - « Annuler » une prime ou un malus après une confirmation.
  - Jamais « sanction ».
- [ ] **Objectifs**.
  - L'objectif collectif de la quinzaine : cible, paliers en pourcentage et prime par chatteur, progression avec la marque de la prévision.
  - Les paliers individuels en vigueur et leur quinzaine de départ.
  - Le propriétaire les change à partir d'une quinzaine pas encore validée, et le manager les lit. Une quinzaine figée dit pourquoi (`pay_period_closed_conflict`).
- [ ] **Réglages › Règles de paie** (propriétaire) gagne le minimum de versement : 15 € par défaut, un changement s'applique aux brouillons.
- [ ] **Commissions** (chatteur ; le manager lit son propre relevé dans Paie, case éteinte).
  - Le héros : ce que tu touches à ce jour pour la quinzaine. Il dit si c'est encore en calcul, validé ou payé, et la date du paiement quand il est payé.
  - « Le parcours de ton argent » : du brut à ce que tu touches, ligne par ligne, puis report et versement attendu. Jamais de date de versement promise.
  - « Ma performance » : ce qu'il te reste à faire pour le palier suivant, et ta part de l'objectif collectif quand la quinzaine en a un. Jamais de classement ni le montant d'un autre.
  - « Mes relevés » : les quinzaines passées, avec leur état et leur total.

**Indicateurs de la paie**, dans Paie et jamais sur le Dashboard (ADR 0024).
- [ ] Prévision de fin de quinzaine : un calcul pur et testé dans `apps/web`, sur le net de l'équipe, les rapports validés et le rythme des jours écoulés dans le fuseau de l'agence.
- [ ] Progression de l'objectif collectif.
- [ ] Répartition des ventes par plateforme et par créatrice, depuis les lignes.
- [ ] Écart avec la quinzaine précédente, en lisant deux quinzaines.

- [ ] **Export CSV** des relevés d'une quinzaine : membre, lignes, primes, malus, report, total, à verser.
- [ ] **Vocabulaire du glossaire** : relevé de commissions, commission, malus, report, à verser. Jamais « fiche de paie » ni « salaire » dans ce que voit un chatteur.

## Refus de l'API, en français (codes de `PAYROLL_ERROR_CODES`)
| Code | Ce que dit l'écran |
| --- | --- |
| `commission_statement_changed_conflict` | « Ce relevé a changé depuis que tu l'as ouvert. Relis la nouvelle version avant de valider. » |
| `commission_statement_status_conflict` | Si le relevé est déjà validé ou payé, l'écran le recharge sans message (valider deux fois ne fait rien de plus). Sinon : « Ce relevé n'est pas encore validé. » |
| `commission_statement_open_conflict` | « La quinzaine n'est pas finie : elle se valide à partir du {lendemain}. » |
| `commission_statement_order_conflict` | « Valide d'abord le relevé de {membre} du {quinzaine}. » |
| `pay_period_order_conflict` | « Valide d'abord la quinzaine du {quinzaine}. » |
| `pay_period_reports_pending_conflict` | « {n} rapports de la quinzaine attendent leur relecture. » avec le lien Équipe › Rapports |
| `pay_period_reports_unread_conflict` | « {n} rapports sont sur des créatrices que tu ne suis pas : le propriétaire valide cette quinzaine. » |
| `pay_period_closed_conflict` | « La quinzaine du {quinzaine} est déjà validée. » |
| `penalty_cancel_conflict` | « Ce malus porte sur des quinzaines toutes validées : passe par un ajustement. » |
| `exchange_rate_missing_conflict` | « Le taux du dollar de la BCE manque pour la fin de la quinzaine. Il arrive chaque jour ouvré vers 16 h. » |
| `commission_rate_missing_conflict` | « {membre} n'a pas de taux de commission en vigueur. » avec le lien Équipe › Membres |
| `payroll_own_forbidden` | « Personne ne décide de sa propre paie : un autre s'en charge. » |
| `payroll_forbidden` | « Seul le propriétaire peut le faire. » |
| `bonus_conflict`, `penalty_conflict`, `pay_adjustment_conflict`, `bonus_tier_set_conflict`, `collective_goal_conflict` | « Cette saisie existe déjà avec d'autres valeurs : recharge la page. » |

## Critères d'acceptation
- Un chatteur ne voit que ses relevés. Une erreur affiche « Le serveur ne répond pas », jamais un faux état vide.
- Valider deux fois le même relevé ne fait rien de plus. Un brouillon modifié entre l'affichage et la validation donne le message du 409, pas une erreur brute.
- « Payé » est absent pour un manager (masqué, et refusé par l'API).
- Aucune case active ni aucune saisie pour soi : le nom du lecteur n'est pas dans la liste des membres d'une saisie.
- Tests de la prévision :
  - une période vide ;
  - une période terminée, où la prévision vaut le réalisé ;
  - un rapport validé tard.
- Un chatteur ne lit que sa progression, jamais les montants d'un autre.
- Finition (Charles, 27/10, 15h22 : « que ce soit vraiment très joli… des hovers partout… une belle hiérarchie des informations ») : chaque écran passe la barre de `docs/design/README.md` § Finition d'un écran, preuves comprises (captures Nuit et Jour, bureau et téléphone, mouvement réduit).

## Hors périmètre
Factures, avoirs et export comptable (EQ-06), facturation des créatrices et pénalités de retard, rapprochement bancaire (plus tard selon l'ADR).

## Notes de session
- 2026-10-28 (fil Équipe) : fiche reprise d'après l'API d'EQ-04 (lot 3) et maquettes des écrans, sans code. Trois manques relevés à l'API : les détails du paiement (ADR 0023), l'index des quinzaines, le relevé en retard d'une heure sur les rapports validés. Le code attend la fusion de #259 et des lots 3a à 3e.
