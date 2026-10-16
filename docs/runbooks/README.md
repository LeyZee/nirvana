# Runbooks

Procédures d'exploitation, écrites pour être suivies sous stress, par quelqu'un qui n'a pas le contexte. Chaque runbook est testé au moins une fois avant la mise en production (phase 2).

| Runbook | Quand |
|---|---|
| `incident.md` | Quelque chose va mal en production (bot qui déraille, envois en double, plateforme qui bloque) |
| `rotate-secrets.md` | Un secret a fuité ou arrive à échéance |
| `restore.md` | Restaurer la base de données |
| `session-expired.md` | La session Reveal est expirée ou invalide |
