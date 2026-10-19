# 2026-10-19 · Route du mode de l'agent (Bilan)

Fait : `PUT /v1/agent/mode { creatorId, mode }` dans le module `conversations`.
- Arrêt pose l'interrupteur de la créatrice, sans ré-authentification.
- Copilote le lève et repasse en copilote les conversations restées en automatique.
- Automatique est refusé en 409 `agent_mode_conflict` jusqu'à B3.

Chaque changement écrit sa ligne `kill_switches`, son événement `kill_switch_toggled` et sa ligne `audit_log`. Les clics d'une créatrice sont sérialisés par un verrou de transaction, et `set_at` prend `clock_timestamp()` une fois le verrou tenu. La réponse est `{ mode, globalStop }` : le mode comme `GET /v1/dashboard`, et si l’interrupteur global le tient (suggestion du fil Extension). Contrat : `SetAgentModeBodySchema` et `AgentModeResultSchema` dans `contracts/dashboard.ts`. `message-flow.md` §6 est à jour.

Pas fait : le verrou Automatique (B3) ; le branchement de l'écran (fil Extension, après la fusion).

Décisions : la route vit dans `conversations`, propriétaire de l'interrupteur et du mode des conversations. Le mode rendu reprend la règle de `supervision` (Arrêt si un interrupteur global ou de la créatrice est posé), sans importer ce module. Rôles : propriétaire et opérateur de la créatrice, comme les autres commandes.

Relectures : Extension (accord, `globalStop` ajouté à sa demande) et agent (accord ; `ops:kill-switch` prend désormais le même verrou et `clock_timestamp()` pour la portée créatrice, sa remarque 1).

Découvertes : `POST /v1/conversations/:id/mode` accepte encore `auto` sans verrou. B3 doit le fermer aussi. La politique RLS de `kill_switches` laisse une transaction de créatrice écrire une ligne globale (`creator_id` nul accepté par `WITH CHECK`) : aucun code ne le fait, mais B3 ou G16 peut la resserrer.

Candidats à suppression : aucun.

Vérifié : `pnpm check`, `pnpm test`, test d'intégration `agent-mode` (6 cas). Le cas des clics simultanés échoue bien quand on retire le verrou.
