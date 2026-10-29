# 2026-10-29 — Recette design, Équipe › liens entre fiches et Rapports — done

Fait :
- EQ-11 : la fiche d'un membre mène à son travail. « Ses shifts » ouvre Planning avec ses shifts en avant, les autres atténués, et « Toute l'équipe » pour revenir. « Ses rapports » ouvre Rapports avec son pli ouvert. « Son relevé » ouvre Paie › Quinzaine sur son relevé, ou dit « Pas de relevé de … sur cette quinzaine ». Dans la fiche d'un shift, son nom ouvre sa fiche. L'adresse garde `?membre=` sur Planning, Rapports et Paie. Les liens du panneau de statut (#318) vers les shifts restants d'un membre absent ou parti passent aussi par ce filtre.
- EQ-13 : dans la fiche d'un shift fini, « Sans rapport » ou le statut du rapport mène à son pli de la quinzaine dans Rapports. La phrase « Ce shift est fini… » est retirée.
- EQ-14 : sous le compte « À valider », le pli « N shifts sans rapport » donne le membre, le shift et « depuis 8 h », le plus ancien en premier. Il couvre la quinzaine en cours et la précédente. Dans la ligne d'un membre, seul « N sans rapport » est ambre.
- EQ-15 : « Relancer » copie le mot prêt pour WhatsApp, aux heures du membre. Sans presse-papiers, le mot s'affiche pour une copie à la main. Il est sur chaque shift sans rapport, dans le pli et dans les lignes de quinzaine.
- EQ-21 : un rapport envoyé se dit « En attente » chez le membre, comme le chiffre au-dessus. Les libellés en casse de phrase étaient déjà faits par DASH-24.
- EQ-26 : « Valider (N) » n'apparaît qu'avec une sélection. Il est au pied de la liste qu'il valide, dans une barre qui reste en vue, et plus dans l'en-tête.

Décisions :
- Les trois liens de la fiche sont sous ses faits, au-dessus de l'accès et des notes, et non tout en bas, où les notes qui s'allongent les pousseraient hors de vue.
- « Relancer » copie toujours, sans passer par la feuille de partage : le geste est le même sur ordinateur et sur téléphone.

Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié :
- `pnpm check` ✓, tests web ✓ : liens et adresses, focus du planning, pli ouvert, shifts sans rapport et mot copié, relevé ouvert ou absent, barre de validation.
- Captures nuit 1440 et 390.
