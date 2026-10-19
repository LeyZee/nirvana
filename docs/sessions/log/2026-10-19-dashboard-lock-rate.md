# 2026-10-19 — Le Dashboard affiche le taux lu par le verrou (supervision) — done

Fait : `conversations.automaticLock(creatorId)` rend le verrou et le taux en réel sur lequel il a été décidé (`readAutomaticLock`, dont `readAutomaticGate` ne garde que le verrou). Le port `AutomaticView` de `supervision` le reçoit et `GET /v1/dashboard` affiche ce taux : `liveRate.rate` et `liveRate.decided` ne peuvent plus différer de `automatic.missing` dans la même réponse. La requête de `supervision` ne lit plus que la tendance à trois semaines, avec le départage `id desc` de `conversations`.

Pas fait : rien.

Décisions : `automaticGate(creatorId)` devient `automaticLock(creatorId)` (seul appelant : la racine de composition), avec l'accord de Bilan sur la PR.

Découvertes : aucune.

Candidats à suppression : aucun.

Vérifié : `pnpm check`, `pnpm test` (test du domaine ajouté : taux et ce qui manque identiques, tendance lue à part) ; intégration en CI (pas de Docker ici).
