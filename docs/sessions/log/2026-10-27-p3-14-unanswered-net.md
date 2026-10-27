# 2026-10-27 — P3-14 Filet « Sans réponse » et heures d'activité — done
Fait :
- `supervision/domain/dashboard.ts` : `unansweredSince(lastInboundAt, now, her)`. Hors de ses créneaux de réponse, le filet se tait ; dans un créneau, il compte 30 min depuis le plus tard de son message et de l'ouverture (`replyOpenedAt`). Sans réglage, rien ne change.
- Lecteur du Dashboard : lit `creators.agent_hours` avec le fuseau, un réglage absent ou illisible vaut les défauts, comme le worker.
- Tests : unitaires (sans réglage, nuit, ouverture à 9 h, fermeture à 18 h) et intégration (créneau fermé, ouvert depuis 10 min, ouvert depuis 35 min compté depuis l'ouverture).
Pas fait : l'écran des heures (Extension).
Décisions : aucune.
Découvertes : à l'ouverture, `conversation.reopen` reprend les fans en attente à 15 s d'écart ; au-delà d'environ 120 fans, les derniers peuvent tomber dans le filet (30 min) avant leur tour. Sans effet à notre volume ; à revoir si une créatrice dépasse ce nombre (relevé de Bilan sur #236).
Candidats à suppression : aucun.
Vérifié : pnpm check, pnpm test ; intégration Dashboard.
