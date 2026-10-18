# 2026-10-18 — Règle d'évolution des payloads du journal (G13) — done
Fait : G13 de la revue à froid. Avant, une ligne du journal écrite avant #54 (`handoff_requested` sans `conversationId` ni `cause`) ou avant #60 (`takeover_started` sans `conversationId`) faisait échouer `toStoredEvent`, donc la lecture de la conversation et `db:rebuild-projections`. Maintenant, `conversations/infra/db/rows.ts` passe chaque ligne par un *upcast* qui complète ces deux anciennes formes (la conversation de la ligne, la cause `other`), sans jamais réécrire le journal. L'ADR 0007 gagne la règle « Évolution des payloads » : un champ facultatif s'ajoute librement ; tout autre changement arrive avec son upcast et un test qui relit l'ancienne forme ; on ne retire jamais une valeur d'enum encore présente dans le journal.
Pas fait : rien.
Décisions : la cause d'un ancien `handoff_requested` est `other`, le rang « Important » des alertes : on ne sait pas ce qui l'avait causé.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test:all ✓.
