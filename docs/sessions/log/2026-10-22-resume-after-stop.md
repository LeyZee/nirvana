# 2026-10-22 · Un fan qui a écrit pendant un Arrêt reçoit sa réponse à la reprise (recette R-G2)

Fait :
- Avant : `conversation.respond` voyait l'interrupteur et ne faisait rien ; la conversation restait `pending`, sans brouillon ni job, jusqu'à ce que le fan réécrive.
- Lever l'Arrêt depuis le Dashboard (`PUT /v1/agent/mode`, Copilote ou Automatique) réenfile `conversation.respond` tout de suite pour chaque conversation `pending` de la créatrice, si l'interrupteur global n'est pas posé. Un clic qui ne lève rien n'enfile rien.
- Lever un interrupteur depuis le terminal (`pnpm ops:kill-switch`, global, créatrice ou conversation) fait de même sur son périmètre. Un autre interrupteur encore posé laisse `respond` sans effet, comme avant.
- Port `idsInState` dans le module `conversations`.

Pas fait : une session plateforme redevenue valide ne réenfile rien (connecteur Reveal, lot A).

Décisions : réenfiler avec la même clé de job que l'ingestion (`replace`) : un message du fan arrivé entre-temps ne donne toujours qu'une réponse.

Relectures : aucune (module `conversations` et `ops.ts`, zone Bilan).

Découvertes : aucune.

Candidats à suppression : aucun.

Vérifié : `pnpm check`, `pnpm test`, intégration `apps/api` (dont `agent-mode` : reprise depuis le Dashboard et depuis le terminal).
