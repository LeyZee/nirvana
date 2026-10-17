# 2026-10-17 — Contrats pour les alertes (demande du fil Alertes Telegram, P3-07) — done
Fait : `handoff_requested` porte `conversationId` et `cause` (liste fermée `HANDOFF_CAUSES`) ; `conversation.respond` remplit la cause donnée par le moteur, sinon `guard` ou `budget` selon le blocage, sinon `other`. Nouvel événement `budget_threshold_crossed` (sans créatrice, outbox). `takeover_started` est copié dans l'outbox. Le worker ne démarre plus le playground (`AppOptions.withPlayground`), remarque du fil agent.
Pas fait : la publication de `budget_threshold_crossed` par `onBudget` (`apps/api/src/llm.ts`, fil agent) ; la cause remplie par le composeur et la vision (`ComposeResult.cause`, fil agent) ; jobs `alerts.*`, ligne de composition-root et branchement du worker (avec le lot 1 du fil Telegram) ; événements Ventes, Mots-clés, Validations (liste attendue).
Décisions : un `handoff_requested` déjà en base avec l'ancienne forme ne se relit plus ; aucun n'existe hors des tests, aucune conversation réelle n'ayant été ingérée.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓, pnpm test:integration ✓ (db 31, api 55).
