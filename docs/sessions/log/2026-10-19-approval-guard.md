# 2026-10-19 · Gardes dures à l'approbation (Bilan, revue 09 G5)

Fait : les bulles qu'un chatteur approuve, retouchées ou non, repassent les gardes dures de l'agent avant de partir.
- Port `BubbleGuard` dans `conversations`, satisfait par `AgentBubbleGuard` du fil agent (#69, `startBubbleGuard`). Une garde bloquante refuse l'approbation en 422 `draft_unprocessable`, avec `details.guards`, et le brouillon reste en attente.
- Le suffixe `_unprocessable` donne 422 (`server.ts`, `contracts/errors.ts`, `conventions/api.md`).
- Dans la racine de composition, la garde suit la persona de la créatrice. Sans persona lisible, ou avec la persona de démo en production, ce sont les gardes communes (`DEFAULT_GUARD_SETTINGS`) : jamais d'approbation sans garde.
- `message-flow.md` §3 est à jour.

Pas fait : rien côté Bilan. La part de l'agent dans G5 (gardes sur le message entier démasqué) est dans main depuis #69.

Décisions : les gardes s'appliquent à toute approbation, pas seulement aux bulles retouchées : un seul invariant, rien ne part sans elles. Les gardes douces restent l'affaire du chatteur.

Relectures : agent (accord ; à sa demande, le repli appelle `startSharedBubbleGuard`, ajouté à l'index de l'agent avec son accord, au lieu de recopier `createBubbleGuard`).

Découvertes : aucune.

Candidats à suppression : aucun.

Vérifié : `pnpm check`, `pnpm test`, intégration `conversations-http` (« Je suis une IA » refusé seul et coupé sur deux bulles, brouillon toujours en attente, puis approbation normale).
