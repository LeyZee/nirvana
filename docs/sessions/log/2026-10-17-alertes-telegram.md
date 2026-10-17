# 2026-10-17 — Alertes Telegram : conception (ADR 0020, fiche, maquette) — done
Fait : fiche `PROPOSED-night-alerts.md` de Bilan (#47) étendue sur place après la demande de Charles de 21h49 (créer et gérer plusieurs bots aussi facilement que les clés IA). Elle couvre maintenant le modèle de données, le contrat API, la table de classement des événements, la création en quatre étapes et la robustesse. ADR 0020 proposed. Maquette cliquable de Réglages › Alertes : https://claude.ai/artifact/G28Jm13R7CAgy26nobhwNg (données fictives).
Pas fait : aucun code. Il attend l'ID de la fiche, puis le module serveur passe avant l'écran.
Décisions : le jeton quitte `providers` pour une table `alert_bots` (plusieurs bots), scellée par `CREDENTIALS_ENCRYPTION_KEYS`. `getUpdates` par le worker, pas de webhook. Les groupes sont découverts par `my_chat_member`, jamais saisis. Un déclencheur sur `domain_events` enfile le scan au commit. Une file série par groupe et une par bot. Au moins une fois pour l'urgent. Aucune donnée de fan chez Telegram.
Découvertes : trois changements de contrat pour Bilan (ADR 0020) : `conversationId` et une `cause` fermée sur `handoff_requested`, l'événement `budget_threshold_crossed` depuis `onBudget`, et `takeover_started` publié à l'outbox. Le Dashboard v6 lira `nightCounts` du module.
Candidats à suppression : aucun.
Vérifié : relecture des liens et des noms cités.
