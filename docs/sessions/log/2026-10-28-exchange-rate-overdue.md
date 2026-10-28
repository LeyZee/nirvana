# 2026-10-28 — Paie : l'alerte quand aucun taux de la BCE n'arrive (ADR 0033, second lot) — done (local)
Fait :
- `payroll.fetch_exchange_rates` publie `exchange_rate_overdue` (`{ currency, lastRateDay, day }`) quand le dernier taux d'une devise a plus de deux jours ouvrés, au plus une fois par jour de la BCE et par devise (verrou consultatif, comme `backup_overdue`). La vérification passe après chaque lecture, réussie ou non : une BCE injoignable est justement le cas qui sonne ; le job échoue ensuite comme avant et réessaie.
- Préparés pour Bilan dans un commit séparé, qu'il reprend ou remplace : le type et son payload dans `packages/contracts`, la migration 0030 (les deux CHECK). La liste du déclencheur Telegram ne bouge pas : elle suit `SCANNED_EVENT_TYPES` et change avec le rendu, côté Telegram.
Pas fait : le rendu Telegram (fil Telegram) ; la PR, qui attend l'acceptation de l'ADR 0033 et le mot de Charles.
Décisions :
- Un jour ouvré manquant est un jour du lundi au vendredi strictement entre le dernier taux et aujourd'hui, dans le fuseau de la BCE (Francfort) : le taux du jour arrive l'après-midi et ne compte pas encore. Pâques et Noël restent sous le seuil.
- Une devise sans aucun taux n'est pas mesurée : pas de dernier jour à dire, et l'échec de lecture est déjà l'erreur du job.
- Le journal des migrations place 0030 avant 0031, pour que le dernier instantané trié par nom soit le plus récent (drizzle-kit prend le dernier par nom).
Découvertes : l'ADR 0034 est prise dans `main` (#263) ; la prochaine libre est 0035.
Candidats à suppression : aucun.
Vérifié : `pnpm check` ✓ (dérive du schéma alignée) ; tests unitaires de l'API ✓ (707) ; intégration de la base ✓ (107) et de l'API ✓ (344, dont deux workers à la même heure qui n'écrivent qu'une alerte).
