# 2026-10-17 — Contrôle de l'agent partagé, pastille de la barre, créatrices lues une fois — done
Fait : le mode de l'agent et son verrou vivent dans `apps/web/src/agent` (`mode.ts`, `useAgentMode`), lus par le contrôle du Dashboard et par une pastille en lecture seule dans la barre (`AgentPill`, ouvre le Dashboard, cachée sur téléphone). Automatique ne s'ouvre que si le serveur le dit (`automatic { open, missing }`, ADR 0019) et l'info-bulle dit ce qui manque, chiffres à l'appui ; flèches clavier du groupe radio ; Arrêt toujours confirmé. Créatrices et Suivi lisent les créatrices par un seul `useCreators` (cache partagé). Alias `@/` dans la config Vitest de `apps/web`.
Pas fait : la route serveur du mode et du verrou (fil Bilan, revue 09 B3) : l'écran reste sur un état d'exemple ; tests d'écran au-delà de la logique pure (revue 09 G15, suite).
Décisions : forme proposée au fil Bilan pour `contracts` : `automatic: { open: boolean; missing: ({ kind: 'live_rate', value, target } | { kind: 'decided_drafts', value, target } | { kind: 'blind_test' })[] }`, le texte est écrit par l'écran ; contrôle unique sur le Dashboard, barre en lecture seule (coordinateur, 17/10).
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓ (66 web), rendu à 1440 px et 400 px (pastille, info-bulle du verrou, flèches, Arrêt confirmé puis pastille « Arrêté »).
