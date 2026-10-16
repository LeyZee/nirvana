# 0010. Persona = donnée versionnée (YAML + schéma Zod), pas du code

Statut : accepted
Date : 2026-10-16

## Contexte

La persona de Messalina (identité, style, limites, kinks, dégoûts, exemples, horaires) évoluera souvent, par Charles et Messa, sans développeur. Il faut savoir quelle version a produit quel message, et pouvoir comparer deux versions en évals.

## Décision

- La persona est un fichier **YAML** dans `personas/<creator>/vX.Y.Z.yaml`, validé par `PersonaSchema` (Zod, `packages/contracts/src/persona.ts`), documenté dans `docs/reference/persona-schema.md`.
- Elle est **chargée en base** (`persona_versions`, contenu + hash) par la commande `pnpm persona:load` ; une seule version `is_active` par créatrice ; l'activation est un événement audité.
- Chaque draft référence `persona_version_id`.
- Les prompts (`packages/llm/prompts/`) sont des gabarits qui **reçoivent** la persona ; ils ne contiennent aucune donnée de Messalina.
- Le dépôt ne contient **pas** la vraie persona : seulement `v0.0.0.yaml` avec des placeholders et le schéma. La vraie vit dans un dépôt privé ou un coffre, chargée par la commande.
- Éditeur de persona dans le dashboard : phase 5 (lecture/édition avec validation, historique).

## Conséquences

- Messa et Charles éditent une donnée, pas du code ; les sessions Opus ne touchent pas à la persona.
- Les évals comparent des versions ; la traçabilité est complète.
- Coût : maintenir le schéma et sa doc ; les ajouts de champs passent par une migration de schéma Zod (versionnée).

## Alternatives rejetées

- **Persona dans le prompt système** en dur : invisible, non versionnée, non testable.
- **Persona en base uniquement, éditée en UI dès le début** : l'UI arrive en phase 5 ; le YAML est lisible, diffable et suffisant avant.
