# Hybride : les fans qui valent le plus vont à un humain, et le shift commence par un brief
Statut : proposed (ID à donner par Charles ; née du playbook Desirely du 27/10)
Phase : Équipe (après EQ-02 et EQ-13)
Dépend de : ADR 0024 et 0025 (hybride), EQ-02 (planning), EQ-13 (passations), P6-01 (`sales`)
Branche : task/<id>-hybrid-routing-by-value

## Objectif
Quand un chatteur est en poste, l'agent garde le volume et passe la main sur les fans chauds ou de valeur ; au début de chaque shift, le chatteur reçoit dans Nirvana la liste des fans à reprendre dans Reveal, dans l'ordre.

## Contexte à lire
ADR 0024, ADR 0025 (le chatteur chatte dans Reveal), EQ-02, EQ-13, `apps/api/src/modules/agent/domain/hold.ts`, `docs/reference/desirely-analysis.md` (§ Playbook, hybride).

## Ce que dit le playbook
« L'IA gère le volume, l'humain garde la valeur. » L'IA s'arrête quand un fan devient chaud ou stratégique et prévient le chatteur. Priorités de l'inbox : gros acheteurs en ligne, nouveaux, réguliers, le reste ; six à quinze conversations épinglées ; un tour toutes les 20 à 30 minutes ; checklist de début et de cours de shift.

## À faire
- [ ] Règle pure de passation par valeur : seuil de dépense cumulée (réglage propriétaire, défaut 100 €) ou note de désir en bande « chaud » (`P3-12-desire-score.md`) ; seulement si un chatteur est en poste pour cette créatrice ; sinon l'agent continue.
- [ ] Brief de début de shift (écran Aujourd'hui du chatteur) : fans à reprendre, triés par valeur puis par attente, avec la raison en une ligne et le lien Reveal ; rien du texte des conversations hors poste (ADR 0025).
- [ ] Rappel de tour (Telegram ou écran) toutes les 25 minutes pendant le shift, coupable.
- [ ] Journal : chaque passation par valeur est une passation EQ-13, avec sa cause.

## Critères d'acceptation
- Tests : pas de passation sans chatteur en poste ; seuil réglable ; un fan rendu à l'agent par le chatteur n'est pas repassé dans l'heure.

## Hors périmètre
Les commissions, le classement des chatteurs.

## Notes de session
