# 2026-10-19 · identity_policy retiré, rester en personnage fixé dans le code (ADR 0021)

Fait :
- Décision de Charles (carte du chat du projet, 19/10 14h11) : « Retirer ». ADR 0021, qui remplace l'ADR 0012 (passée en `superseded`).
- `IdentityPolicySchema` et `CreatorSettings.identityPolicy` retirés de `packages/contracts`. Le test vérifie qu'un réglage stocké avec l'ancienne clé se lit encore, sans elle.
- Aucune migration : le réglage vit dans le `jsonb` `creators.settings`, et le schéma ignore les clés inconnues.
- CLAUDE.md, glossaire, `message-flow.md`, `persona-schema.md`, index des ADR à jour.
- Rien à changer dans l'API, `persona:load`, `persona:validate`, les fixtures ni `apps/web` : aucun ne lisait le champ.

Pas fait : `docs/architecture/ai-engine.md` (§ politique, point 4) revient au fil agent, qui fait sa PR doc. Les fiches de tâche et `brainstorm/` gardent leurs mentions (historique).

Décisions : une nouvelle ADR plutôt qu'un amendement, l'ADR 0012 étant `accepted` donc immuable (`docs/adr/README.md`).

Relectures : agent.

Découvertes : aucune.

Candidats à suppression : aucun.

Vérifié : `pnpm check`, `pnpm test`.
