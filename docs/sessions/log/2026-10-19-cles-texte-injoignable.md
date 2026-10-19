# 2026-10-19 — Clés IA : un texte vrai quand la vérification n'a pas pu se faire — done

Fait : quand un fournisseur ne peut pas vérifier une clé, la fiche ne dit plus « Ta clé n'est pas en cause » (rien ne l'avait vérifié). Les vérificateurs distinguent un quota ou une limite d'appels (429) d'une panne (5xx, délai dépassé, réseau, réponse illisible) ; le texte dit lequel et que la clé n'a pas pu être vérifiée. Une clé refusée garde ses textes par cause.
Pas fait : rien.
Décisions : la cause reste interne au module providers (champ `reason` de `RefusedKey`), sans changement de contrat.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓.
