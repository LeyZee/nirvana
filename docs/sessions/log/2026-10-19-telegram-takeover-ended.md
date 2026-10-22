# 2026-10-19 — P3-07 : l'alerte de remise à l'humain se ferme quand on rend la main — done
Fait : le module `telegram` lit `takeover_ended` (recette R-G4) : signal `release`, fermeture qui modifie le message d'origine « ✓ Rendu à l'agent par <prénom> » ; une alerte déjà fermée (prise en main puis rendue) ne l'est pas deux fois ; `SCANNED_EVENT_TYPES` et le déclencheur `domain_events_telegram_scan` (migration 0011, liste seulement) ; tests unitaires (classement, lecture, rendu échappé) et d'intégration (une seule modification pour deux remises).
Pas fait : la publication de `takeover_ended` dans `domain_events` avec `conversationId` appartient au module `conversations` (Bilan) : sans elle, rien n'arrive encore au module.
Décisions : une fermeture par modification ne réécrit jamais un message déjà fermé (le premier humain reste nommé) ; même sujet que l'alerte d'origine, sans son.
Découvertes : `takeover_ended` n'est pas dans `PUBLISHED` (`conversations/application/journal.ts`) et son payload (`controlPayload`) n'a pas de `conversationId`.
Candidats à suppression : aucun.
Vérifié : `pnpm check` ✓, tests unitaires du module ✓ ; tests d'intégration laissés à la CI (pas de Docker dans cette session).
