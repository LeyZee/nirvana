# 2026-10-19 — Persona : textes de la recette (A-13, A-14) — done

Fait : les valeurs `<à remplir>` de la persona d'exemple ne s'affichent plus brutes. Un champ texte est vide avec l'indication « À remplir », et les étiquettes de liste sont masquées. À l'enregistrement, elles sont retirées des listes et vidées dans les textes (`withoutPlaceholders`), donc l'agent ne lit jamais `<à remplir>`. Un prénom laissé tel quel est refusé (« Prénom » à remplir). Le Playground écrit « Écris comme le fan le ferait… » quand le scénario ne donne pas de prénom.
Pas fait : « Mineur possible » en double (A-14) était déjà corrigé par #89.
Décisions : aucune.
Découvertes : création de créatrice et activation de version absentes de l'interface ; routes à écrire (PR suivante, Bilan en relecture).
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test (web) ✓.
