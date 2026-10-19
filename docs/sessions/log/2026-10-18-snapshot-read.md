# 2026-10-18 — Fiche de conversation lue d'un seul instant (G4) — done
Fait : G4 de la revue à froid. Avant, `reader.get` (GET /v1/conversations/:id) lisait l'état de la conversation puis ses brouillons ouverts en deux requêtes en READ COMMITTED : un brouillon validé entre les deux apparaissait avec l'ancien état (`pending` au lieu de `awaiting_approval`). C'est ce qui rendait l'e2e de phase 0 intermittent (#45). Maintenant, `withTenant` accepte un mode de transaction, et `SNAPSHOT_READ` (REPEATABLE READ, lecture seule, exporté par `@nirvana/db`) fait lire la fiche dans un même instantané. Test : un écrit validé entre deux lectures d'un instantané n'y apparaît pas, et un instantané refuse toute écriture ; le test échoue en READ COMMITTED.
Pas fait : rien.
Décisions : la lecture seule rend l'erreur explicite si quelqu'un écrit un jour dans cette lecture.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test:all ✓.
