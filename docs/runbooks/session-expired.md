# Session plateforme expirée

Symptômes : `platform_accounts.session_state = expired`, notification « Session Reveal expirée », le connecteur est arrêté (coupe-circuit).

1. Charles ouvre Reveal dans Chrome avec l'extension installée, se connecte normalement.
2. Popup de l'extension → **Sync**. L'extension envoie la session chiffrée à `/v1/connector/sessions` ; le dashboard affiche `valid` dans la minute.
3. Le connecteur redémarre seul (health check) ; vérifier dans Supervision que le poll reprend et qu'aucun message n'a été manqué (`connector.reconcile` tourne automatiquement après une re-sync).
4. Si `warning` (session proche de l'expiration) revient trop souvent : noter dans `reveal-api-observed.md` la durée de vie observée et ajuster l'alerte.
5. Si la session est invalidée **à chaque connexion ailleurs** (Reveal n'accepte qu'une session) : éviter d'ouvrir Reveal sur un autre appareil pendant que le bot tourne, ou passer par l'option C (navigateur serveur) : à décider en phase 2.
