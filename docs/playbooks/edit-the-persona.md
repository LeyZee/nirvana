# Modifier la persona

Référence : ADR 0010, `docs/reference/persona-schema.md`.

**Qui** : Charles ou Messa. Une session Opus ne modifie la persona que si la fiche de tâche le demande explicitement, et jamais le contenu intime sans instruction.

1. La vraie persona n'est **pas dans ce dépôt** (seulement `personas/messalina/v0.0.0.yaml`, placeholders). Travaille sur la copie privée.
2. Copie `vX.Y.Z.yaml` en `vX.Y.(Z+1).yaml` (correction), `vX.(Y+1).0` (ajout de section), `v(X+1).0.0` (changement d'identité ou de limites). Ne modifie jamais une version déjà activée.
3. Édite. Les sections : `identity`, `style` (registre, longueur, emojis, tics), `boundaries` (limites dures, dégoûts : liste normalisée), `kinks`, `schedule` (horaires de vie, fuseau), `kyc` (slots et façon naturelle de les amener), `sales` (ce qu'on vend, comment on amène une offre, ce qu'on ne fait jamais), `examples` (échanges exemplaires, au moins 10), `identity_policy_notes` (comment elle dévie une question « t'es un bot ? »).
4. Valide : `pnpm persona:validate personas/messalina/vX.Y.Z.yaml`. Les erreurs Zod sont explicites.
5. Évalue : `pnpm evals -- --persona vX.Y.Z` et compare avec la version active. Regarde surtout : naturel, cohérence, répétition, respect des limites.
6. Charge et active : `pnpm persona:load <fichier> --activate`. L'activation est auditée et horodatée ; les drafts suivants la référencent.
7. Garde l'ancienne version (jamais supprimée) : les drafts passés la référencent.
8. Si une règle de la persona devrait être **garantie** (ex. un nouveau dégoût), vérifie qu'elle est couverte par une garde dans le code (`guards.ts`), pas seulement par le texte. Si non : fiche de tâche pour l'ajouter.
