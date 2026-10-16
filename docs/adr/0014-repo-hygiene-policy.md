# 0014. Politique d'hygiène du dépôt

Statut : accepted
Date : 2026-10-16

## Contexte

Charles demande un nettoyage permanent : un dépôt aussi propre que possible, sans fichiers ni scripts parasites qui ne servent plus, mais avec une prudence absolue sur ce qui est supprimé (« il ne faut pas supprimer n'importe quoi, des trucs qui servent »). Plusieurs sessions de code indépendantes travailleront dans le même dépôt ; chacune laisse des traces si rien ne l'encadre.

## Décision

- La politique complète est `docs/conventions/hygiene.md` ; cette ADR en fixe les principes :
  1. **Rien de temporaire hors `.scratch/`** (ignoré par git). Tout fichier de travail, script jetable, export, note intermédiaire y va. `.scratch/` est vidé en fin de session.
  2. **Chaque session nettoie ce qu'elle a créé** avant de terminer (checklist de `docs/sessions/README.md`).
  3. **Supprimer ce qu'on n'a pas créé suit une procédure** : liste protégée → recherche de références → historique git → commit séparé `chore(cleanup)` avec justification. En cas de doute, on inscrit le fichier dans « Candidats à suppression » du LOG et on ne supprime pas.
  4. **Liste protégée** (jamais supprimée sans décision de Charles) : ADR, LOG, fiches de tâches, migrations appliquées, personas, jeux de données d'évals et enregistrements FakeReveal, `reveal-api-observed.md`, `.github/`.
  5. **Outils automatiques** : `knip` (code et dépendances morts) dans `pnpm check` ; `gitleaks` ; taille du dépôt surveillée (pas de binaires, médias ni exports commités).
  6. **Sessions de nettoyage périodiques** (`H-xx`) toutes les ~10 tâches, dédiées, revues comme une PR normale.
- Propre ne veut pas dire léger : on garde ce qui sert (docs, tests, fixtures), on supprime ce qui ne sert plus.

## Conséquences

- Le dépôt reste lisible pour une session fraîche ; la suppression est tracée et réversible (git).
- Coût : quelques minutes par session ; une procédure à suivre avant une suppression. Voulu.

## Alternatives rejetées

- **Nettoyage « au jugé »** : c'est exactement ce que Charles craint.
- **Interdire toute suppression** : le dépôt se remplit de résidus ; l'inverse de la demande.
