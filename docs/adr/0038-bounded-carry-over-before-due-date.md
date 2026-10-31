# 0038. Paie : un petit montant est reporté deux fois au plus, pour que chaque facture soit payée avant son échéance

Statut : proposed
Date : 2026-10-31
Remplace : dans l'ADR 0023 (§ Les règles d'Imperium, telles quelles), « le report des petits montants sous le minimum de versement » repris à l'identique, pour le seul report d'un montant positif ; précise son § Factures (l'échéance)

## Contexte

L'ADR 0023 reprend d'Imperium le report des petits montants : un relevé dont le total est positif mais sous le minimum de versement ne verse rien, et son total passe sur la quinzaine suivante, autant de fois qu'il le faut. La même ADR pose qu'« un montant reporté reste facturé dans sa période : le report retarde le versement, pas la facture ».

Les factures (EQ-06) rendent ces deux règles incompatibles avec le Code de commerce dès que le report dure :

- **la facture est émise à la validation du relevé, et son échéance est figée ce jour-là.** Elle porte une date (`issued_on` + `due_days`) et les conditions de paiement que la loi impose (art. L441-9 : échéance, escompte, pénalités, indemnité de 40 € de l'art. D441-5). Le relevé qui la versera n'existe pas encore, l'échéance ne peut donc pas suivre le versement ;
- **le délai de paiement convenu ne dépasse pas 60 jours après la date de la facture** (art. L441-10). #328 a ramené le plafond du réglage à 60 jours (il était à 90) ;
- **un report sans limite peut laisser une facture impayée au-delà de son échéance.** Un chatteur qui vend peu reste sous le minimum plusieurs quinzaines de suite : sa première facture attend des mois. L'agence doit alors, de plein droit, les pénalités de retard et 40 € d'indemnité par facture, et s'expose à l'amende administrative de la DGCCRF (art. L441-16). Sur une facture de 9 €, l'indemnité dépasse le montant.

Charles (31/10) : « une facture reportée peut dépasser son échéance avant d'être versée, à trancher avant la mise en service / fais ce que tu me conseillerais de faire en tant que comptable français ».

## Décision

**L'échéance d'une facture est sa date d'émission plus le délai du réglage, 60 jours par défaut.** Le réglage `due_days` accepte de 45 à 60 jours. Sous 45 jours, le troisième versement (ci-dessous) pourrait tomber après l'échéance.

**Un total positif sous le minimum est reporté deux fois de suite au plus. La troisième quinzaine le verse, même sous le minimum.** Le registre des reports garde combien de fois de suite le montant a déjà été reporté (1 ou 2). Exemple, avec le minimum par défaut de 15 € :

- 1–15 novembre : 9 €. Relevé validé et facture émise le 17 novembre, échéance le 16 janvier. Rien n'est versé, 9 € sont reportés (première fois).
- 16–30 novembre : 4 €, soit 13 € avec le report. Toujours sous 15 € : 13 € sont reportés (deuxième fois).
- 1–15 décembre : 1 €, soit 14 €. C'est la troisième quinzaine : les 14 € sont versés vers le 20 décembre, environ 33 jours après la facture du 17 novembre et plus de 3 semaines avant son échéance.

**Un cumul nul ou négatif ne verse rien et remet le compte à zéro.** L'agence ne doit alors plus rien : ce qu'elle devait s'éteint par compensation avec ce que le chatteur lui doit (art. 1347 du Code civil), et chaque montant rendu porte son avoir (ADR 0036). Le report négatif reste celui d'Imperium : il n'a pas de limite, car aucune facture n'attend derrière lui.

**Un report repris d'Imperium est versé par la première quinzaine de Nirvana**, même sous le minimum : l'âge de sa facture n'est pas connu.

**Rien ne change pour le reste.** Le minimum de versement garde ses règles (PAIE-22 : il change pour une quinzaine pas encore commencée, jamais en arrière), le dernier relevé d'un membre qui part verse tout (EQ-14), et la règle s'applique à partir de la première quinzaine pas encore commencée à son entrée en service. Aucun relevé validé n'est recalculé.

**L'échéance se surveille.** Une facture qui n'est pas entièrement versée passe en ambre 7 jours avant son échéance, en rouge une fois l'échéance passée (EQ-06, lot 8, d'après le rapprochement du lot 7).

## Question au comptable

Il doit confirmer avant la mise en service (EQ-17) :

- le délai de 60 jours à compter de la date de la facture, plutôt que 45 jours fin de mois ;
- la même règle pour tous les prestataires, établis en France ou non : la loi française s'applique au mandat d'autofacturation, et l'agence ne trie pas ses chatteurs par pays.

## Conséquences

Positives :
- chaque facture est versée au plus tard à la troisième quinzaine, vers 35 jours après son émission, avec plus de 3 semaines de marge sur un délai de 60 jours ;
- la règle reste un compte entier dans le moteur de paie, sans date prévue à deviner : elle se teste en unitaire comme le reste du calcul.

Négatives :
- un chatteur qui vend très peu reçoit parfois un virement sous le minimum, et les frais de WorldRemit pèsent sur ce petit virement ;
- c'est une règle d'Imperium qui change, ce que l'ADR 0023 excluait sans ADR.

À faire après l'acceptation, dans une PR à part (moteur de paie, fil Équipe) :
- `commission-statements.ts` : le relevé lit le rang du report positif qui entre, et verse au troisième ;
- base : le rang dans `carry_overs`, le réglage `due_days` entre 45 et 60 avec 60 par défaut (`DEFAULT_INVOICE_DUE_DAYS`), une nouvelle migration ;
- version du moteur relevée, tests unitaires et d'intégration du report borné et de la remise à zéro ;
- fiche EQ-06, `README.md` du module et glossaire (« Report », « Minimum de versement ») mis à jour.

## Alternatives rejetées

- **Une échéance qui suit le versement** (« à réception du paiement ») : la facture est figée à son émission, et l'art. L441-9 exige une date.
- **Le report sans limite d'Imperium** : une facture peut rester impayée au-delà de 60 jours, avec pénalités, indemnité de 40 € par facture et amende.
- **Ne plus avoir de minimum** : chaque quinzaine verserait tout, même 3 €, et les frais de virement mangeraient les petits montants.
- **Facturer seulement ce qui est versé** (une facture qui regroupe les quinzaines reportées) : l'ADR 0023 et l'ADR 0036 lient la facture à sa quinzaine, et l'art. 289 du Code général des impôts veut une facture dès la prestation, une facture récapitulative ne couvrant pas plus d'un mois civil.
- **Verser quand l'échéance approche** : il faudrait prévoir la date du prochain versement, que personne ne connaît d'avance. Le compte de reports donne la même garantie sans deviner.
