# 2026-10-22 — P3-07 : alerte Telegram quand un message ne part pas — done
Fait : le module `telegram` lit `send_failed` (recette R-G5) : seul l'échec définitif (`isFinal` = true) donne un message important « Un message de l'agent n'a pas pu partir. Il n'écrit plus à ce fan et attend un humain. », dans le fil de la conversation, fermé par une prise en main ou un retour à l'agent ; `SCANNED_EVENT_TYPES` et le déclencheur (migration 0012, liste seulement) ; tests unitaires (classement, lecture) et d'intégration (un seul message pour deux échecs, fermeture par la prise en main).
Pas fait : la publication de `send_failed` dans `domain_events` avec `conversationId` appartient au module `conversations` (Bilan) : sans elle, rien n'arrive encore au module.
Décisions : sujet important, pas urgent (aucun fan en danger) ; pas de règle de secours sur le nombre d'essais pour les lignes sans `isFinal` : l'outbox n'a jamais porté `send_failed` avant ce drapeau ; le code d'erreur de la plateforme n'est pas lu.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : `pnpm check` ✓, tests unitaires du module ✓ ; tests d'intégration laissés à la CI (pas de Docker dans cette session).
