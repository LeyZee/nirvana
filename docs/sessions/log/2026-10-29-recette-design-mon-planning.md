# 2026-10-29 — Recette design, Planning du chatteur — done

Fait : EQ-17 (sur la semaine en cours, la page ouvre sur « Aujourd'hui » ; les jours passés sont repliés au-dessus dans « Plus tôt cette semaine (N) », qui dit « N rapports à faire » quand il en reste ; les autres semaines gardent leur ordre), EQ-18 (seule « En poste » garde une pastille ; « À venir » et « Fini » disparaissent, une ligne finie reste atténuée), EQ-19 (une ligne finie dit où en est son rapport, « Rapport validé », « Rapport en attente » ou « Renvoyé · Reprendre », ou propose « Faire mon rapport » ; le geste ouvre le même panneau qu'Aujourd'hui, et « Annuler » ou un refus le rouvre sur le Planning), EQ-20 (« Proposé à … · en attente de réponse » passe en encre secondaire : une attente normale n'est pas un avertissement).
Décisions : les rapports lus sont ceux des quinzaines où tombent les shifts de la semaine affichée, à l'heure de l'agence ; un shift dont la quinzaine n'est pas lue ne dit rien plutôt que « à faire ». Le statut d'un rapport garde ses mots et ses tons (`MEMBER_STATUS`, `STATUS_TONES`).
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, tests web ✓ (semaine ouverte sur aujourd'hui, jours passés repliés avec le compte des rapports à faire, statut d'un rapport, « Faire mon rapport » ouvre le panneau, pas de pastille « À venir »).
