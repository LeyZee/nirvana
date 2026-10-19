# 2026-10-19 — Dashboard : un Reveal jamais relié n'est pas une panne — done

Fait : quand aucun compte Reveal n'a jamais été relié (non connecté et aucune lecture), le héros dit « Reveal n'est **pas encore relié** » sans couleur, la tuile dit « Pas encore reliée » et le résumé « Reveal pas encore relié ». Le rouge « déconnecté » reste pour une session qui a déjà lu puis a lâché. Nouveau ton `idle` (neutre, retombe sur `--nv-ink-faint` du design system). L'info-bulle d'Automatique ne coupe plus ses lignes : libellé sur une ligne, valeur alignée à droite, largeur maximale 300 px. Au toucher, une info-bulle s'ouvre sous l'élément touché et se ferme au toucher suivant (A-06 de la recette). Le héros dit dans la même phrase que l'IA qui écrit ne répond pas quand Reveal parle en premier, au lieu de le laisser dans le détail plié. La pastille de la barre garde le mode réglé mais ni vert ni point vivant quand Reveal n'est pas relié ou que l'IA ne répond pas, et son titre dit pourquoi (A-02).
Pas fait : « Clé manquante » pour l'IA qui écrit, qui attend un champ du contrat dashboard (demandé à Bilan).
Décisions : aucune.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓, info-bulle rendue dans Chromium (trois lignes de 18 px). Toucher non essayé sur un vrai téléphone.
