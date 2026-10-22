# 2026-10-19 — P3-07 : « Le serveur ne répond pas » sur Réglages › Telegram — done
Fait : quand Nirvana ne répond pas, Réglages › Telegram dit « Le serveur ne répond pas » au lieu de « Telegram ne répond pas » (recette R-C2) ; les messages de panne de la page, de la feuille de bot et de la ré-authentification suivent la même phrase ; test de composant (panne du serveur ≠ Telegram éteint).
Pas fait : rien.
Décisions : « Telegram est éteint » reste réservé au serveur sans clé de chiffrement (404 du module).
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : `pnpm check` ✓, tests web de `settings/telegram` ✓.
