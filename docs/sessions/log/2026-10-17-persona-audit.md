# 2026-10-17 — Audit des champs de la persona (suite de la politique de vente) — in_progress
Fait : le bot se sert de toute la persona (Charles, 17/10 22h11).
- L'horloge des brouillons vient de `creators.timezone`, lue pour chaque brouillon (`timeZoneOf`) ; Paris si la ligne manque.
- La fiche donnée aux modèles ne contient plus le genre, le fuseau ni le délai de réponse ; elle contient les consignes écrites des stratégies, sans leurs chiffres.
- `split_messages` à faux : la réponse part en un seul message ; les gardes lisent les bulles telles qu'écrites.
- `pet_names` : garde souple `pet_name` quand la voix donne un surnom courant qui n'est pas le sien (`guardSettingsOf`).
- Prompts voix 1.5.0 et cerveau 1.6.0 : langue du fan si elle est dans `languages`, sinon la première ; manière de vendre de la fiche.
Pas fait : `keyword_matched` à partir de `notifications.alert_keywords` (PR suivante) ; le délai de réponse (Bilan) ; `never_show` (P6-01).
Décisions : aucune nouvelle.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓.
