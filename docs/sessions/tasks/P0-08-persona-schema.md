# P0-08 Schéma de persona calqué sur OnlyChat
Statut : done
Phase : 0
Dépend de : P0-01
Branche : task/p0-08-persona-schema

## Objectif
Donner à l'interface et à l'agent un seul schéma de persona, celui de la fiche créatrice d'OnlyChat, avec ses listes de valeurs.

## Contexte à lire
ADR 0010 et 0012, `docs/reference/persona-schema.md`, `brainstorm/06-interface-extension-playground.md` (§ Créatrices › Persona), `docs/glossary.md`, CLAUDE.md (règle 3).

## À faire
- [x] `packages/contracts/src/persona.ts` : `PersonaSchema` (Zod, clés inconnues refusées), types inférés, `PERSONA_OPTIONS` (valeurs et libellés français), `PERSONA_BOUNDS`, `ageOn`.
- [x] Sections : `meta`, `details`, `additional_info`, `behavior`, `strategies`, `follow_ups`, `notifications`, `limits`.
- [x] `personas/messalina/v0.0.0.yaml` réécrit en placeholders ; `personas/demo/v0.1.0.yaml`, créatrice fictive.
- [x] Tests : les deux fichiers valident ; listes, bornes, style personnalisé, délais croissants, doublons, 6 000 caractères, âge minimal, fuseau.
- [x] Le playground de P3-01 lit la persona par `PersonaSchema` (`apps/api/src/scripts/persona-file.ts`).
- [x] `docs/reference/persona-schema.md`, `docs/playbooks/edit-the-persona.md`, glossaire, `ai-engine.md` (contexte).

## Critères d'acceptation
- `pnpm --filter @nirvana/contracts test` vert ; `pnpm check` vert.
- `personas/messalina/v0.0.0.yaml` et `personas/demo/v0.1.0.yaml` passent `PersonaSchema`.
- Aucune donnée réelle de Messa ni de fan (ADR 0010).

## Hors périmètre
Le reste de P0-02 (ids, money, events, jobs, settings, media), le chargement en base (`persona:load`), l'éditeur du dashboard, l'import depuis OnlyChat, les gardes.

## Notes de session
- Remplace la structure `identity` / `style` / `boundaries` / `kinks` / `schedule` / `kyc` / `sales` / `examples` de la première version du document de référence, jamais codée. Les horaires de vie et les exemples de voix sortent de la persona (voir la référence).
- Décision : les relances ont une seule source, `persona.follow_ups` ; `CreatorSettings.followUp` est retiré de P0-02 et de `ai-engine.md`.
- Conséquence : la persona ne porte plus de slots KYC (`strategies.kyc.targets` est du texte). La liste fermée `KycSlot` du brief passe dans les contrats (fiche `PROPOSED-fan-memory.md`).
- Fiches créées : `PROPOSED-fan-memory.md` (coder la mémoire déjà conçue et combler ses manques) et `PROPOSED-media-catalog-pricing.md` (catalogue = index des scripts, étapes et bundles Reveal, à valider).
- Fusionnée le 17/10 (PR #17). Reste : chargement en base, éditeur du dashboard et import OnlyChat (hors périmètre, fiches à venir) ; corriger le prompt de voix qui cite encore les exemples de voix « dans la fiche ».
