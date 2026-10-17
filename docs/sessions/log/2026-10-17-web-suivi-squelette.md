# 2026-10-17 — Suivi, squelette : liste des conversations (P0-07b, côté web) — in_progress

Fait : l'onglet Suivi lit `GET /v1/conversations` (P0-05) pour chaque créatrice du compte (`creatorIds` de `/v1/me`) et montre la liste brute, la plus récente en haut : prénom du fan, mode (Copilote, Automatique), dernier message (« il y a 3 min »), pastille d'état du design system (`nv-status--<état>`) et messages non lus. Relecture toutes les 30 s. États vides : aucune créatrice reliée, aucune conversation, serveur muet (avec Réessayer). Lecture seule : ni lecteur, ni action, ni nouvelle route.
Pas fait : la file « à traiter » et le lecteur de conversation (après le squelette, actions de la revue 08) ; pagination au-delà des 200 plus récentes par créatrice (la liste le dit).
Décisions : périmètre fixé par le coordinateur le 17/10 (squelette, pas une Inbox) ; libellés des états repris de `docs/design/README.md`.
Découvertes : `/v1/conversations` exige `creatorId` et aucune route ne liste les créatrices ; un propriétaire dont `creator_ids` est vide voit « Aucune créatrice reliée à ton compte » même s'il a accès à tout. À trancher par le fil Bilan (remplir `creator_ids` du propriétaire à `owner:create` ou exposer la liste des créatrices).
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓ (26 web), rendu à 1440 px et 400 px avec des fans inventés (liste, sans créatrice, liste vide).
