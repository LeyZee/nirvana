# 2026-10-28 — P5-01 persona par blocs, écrans (Extension) — done
Fait :
- Créatrices › Persona : onglets Mode de vie, Goûts, Intime, Style d'écriture et Réponses types (`blocks.tsx`), entre « Détails » et « Infos en plus » ; un bloc vidé de tout n'est pas écrit.
- Jauge de complétude neutre dans l'en-tête (`draftCompletion` : `personaCompletion` sans les placeholders de l'exemple), avec les blocs à compléter qui ouvrent leur onglet.
- 422 `persona_sample_reply_unprocessable` lu par `saveVersion` (`PersonaSampleReplyUnprocessableDetailsSchema`) et posé sur la réponse refusée (`refusedReplyIssues`, libellés `GUARD_LABELS`), jusqu'à la modification suivante.
- Stratégies › KYC : lignes du canevas à remplir (`collectOrAll`), et leur nombre dans le résumé quand elle en retire.
- Tests : `model.test.ts` (onglets, complétude, blocs vides, emojis, 422, canevas), `blocks.test.tsx`, `PersonaSection.test.tsx` (jauge, 422 de bout en bout, détail illisible).
Pas fait : la ligne « À apprendre » dans le Suivi, sur la route de #261 (PR suivante).
Décisions : le premier choix de Style d'écriture crée le bloc depuis « courts » et « comme tout le monde », écrit dans le texte d'introduction avant tout choix.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ; tests du dossier persona (32) ; captures Nuit et Jour, 1 440 et 400 px, sur le serveur de dev.
