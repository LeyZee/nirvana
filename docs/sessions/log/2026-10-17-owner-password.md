# 2026-10-17 — `owner:create` ne montre plus le mot de passe — done
Fait : `readSecret` (apps/api/src/scripts/read-secret.ts) lit un secret au terminal sans écho ; `pnpm owner:create` l'utilise et demande le mot de passe deux fois. Constat de la recette des clés (/mnt/project-files/recette-cles-ia.md).
Pas fait : rien.
Décisions : confirmation obligatoire, puisque la saisie ne se voit plus ; rien n'est créé si les deux saisies diffèrent.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, test unitaire (le prompt s'affiche, le secret jamais) ✓, essai dans un vrai terminal (pty) : rien n'est affiché pendant la frappe.
