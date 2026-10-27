# EQ-09 PWA de la créatrice : routine, revenus, qui est en poste
Statut : todo (lot 5 de l'ADR 0023, phase 5 de la roadmap, ID validé par Charles le 27/10/2026)
Phase : 5
Dépend de : EQ-01, EQ-02, EQ-04 ; la carte de navigation validée et la PR du shell par rôle (ordre dans EQ-01)
Branche : task/eq-09-creator-app

## Objectif
Donner à chaque créatrice une application installable sur son téléphone : sa routine du jour, ses revenus, ses factures, qui chatte pour elle maintenant, et des notifications.

## Contexte à lire
`docs/adr/0023-team-management.md`, `docs/roadmap.md` (phase 5), `apps/web/README.md`, `docs/design/README.md`. Concepts d'origine (Imperium) : routine à deux couches, série fondée sur les tâches essentielles et non sur 100 %, « journée parfaite », push obligatoire pour une facture, heures calmes.

## À faire
- [ ] Module `creator-tasks` : tâches de l'agence (non supprimables par la créatrice, comptent pour la série), tâches personnelles (rappel à l'heure choisie, hors série), complétions idempotentes par jour dans le fuseau de la créatrice, série et « journée parfaite » calculées par le serveur.
- [ ] Écran propriétaire : la routine de chaque créatrice et sa régularité.
- [ ] PWA sous `/app` pour le rôle `creator` : Accueil (routine, qui est en poste), Ma semaine, Revenus (« parcours de ton argent »), Factures, Réglages des notifications. Manifeste, service worker, hors ligne de l'enveloppe, Web Push (clés VAPID en configuration, jamais dans le dépôt).
- [ ] Notifications : vente (groupées en rafale, heures calmes), rappel de routine, série en danger, facture (jamais coupée).

## Critères d'acceptation
- Tests : jour compté dans le fuseau de la créatrice (passage de minuit, heure d'été), double coche sans doublon, série qui casse puis repart.
- La créatrice ne lit jamais une conversation ni un fan (test d'intégration RLS).
- Vérification sur un vrai iPhone installé (zone sûre, notifications).

## Hors périmètre
Projets de la créatrice, liens et trafic, ventes Telegram Stars, gamification au-delà de la série.

## Notes de session
