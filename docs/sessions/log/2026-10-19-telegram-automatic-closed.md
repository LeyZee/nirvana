# 2026-10-19 — P3-07 : alerte Telegram « Automatique refermé » — in_progress
Fait : le module `telegram` lit `automatic_closed` (#91) : signal `automatic_closed` (raisons et nombre de conversations, sans la version de voix), message important « Automatique refermé : l'agent est repassé en copilote sur N conversations. Raison(s) : … », taux au dixième en français, cible sans décimale inutile ; `SCANNED_EVENT_TYPES` et le déclencheur `domain_events_telegram_scan` (migration 0009, liste seulement) ; tests unitaires (texte, lecture tolérante) et d'intégration (une livraison, sujet important, rien de la voix).
Pas fait : rien.
Décisions : sujet important (🟠), pas urgent : aucun fan n'est en danger, l'agent demande seulement à repasser par un humain ; une seule fois par fermeture (clé de livraison = l'événement) ; pas de fil (`threadKey` null), rien ne vient le refermer.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : `pnpm check` ✓, tests unitaires du module ✓ ; tests d'intégration laissés à la CI (pas de Docker dans cette session).
