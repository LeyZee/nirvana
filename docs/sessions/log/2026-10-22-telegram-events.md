# 2026-10-22 · Alertes Telegram : prise en main après une remise, fin de prise en main et échec d'envoi publiés (recette R-G4)

Fait :
- Prise en main permise sur une conversation déjà à `human` : après une remise à l'humain, « Reprendre » répondait 409 et l'alerte ne se fermait jamais. `handoff` garde sa portée (pas de remise sur une conversation qu'un humain tient).
- `takeover_ended` et `send_failed` sont copiés dans l'outbox (`journal.ts`), `send_failed` seulement quand `isFinal` est vrai : les essais intermédiaires restent dans le journal.
- `conversationId` dans le payload de `takeover_ended` et des `send_*` (contrat requis) ; les événements écrits avant sont relus avec la conversation de leur ligne (`upcast` dans `rows.ts`).
- Docs : `data-model.md` (payloads), `message-flow.md` (prise en main), ADR 0020 (proposée : colonne d'état « publié »).
- Tests : machine à états, projection, intégration (un seul `send_failed` final dans l'outbox avec la conversation, `takeover_ended` publié, deux prises en main de suite).

Pas fait : vérification de bout en bout côté Telegram (fil Telegram, après fusion).

Décisions : une seconde prise en main écrit un second `takeover_started` plutôt que d'être ignorée : il dit qui tient la conversation maintenant.

Relectures : Telegram (lit les deux événements).

Découvertes : aucune.

Candidats à suppression : aucun.

Vérifié : `pnpm check`, `pnpm test`, intégration `apps/api`.
