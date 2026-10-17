# Roadmap

Dernière revue : 2026-10-16. Chaque phase a un critère d'acceptation vérifiable ; on ne passe pas à la suivante sans. Les fiches de tâches sont dans `sessions/tasks/`.

| Phase | Nom | Critère d'acceptation | Fiches |
|---|---|---|---|
| **0** | Fondations | `pnpm check` et `pnpm test` verts en CI sur un squelette où chaque module existe ; un message injecté via `FakeConnector` produit un événement `message_received` et un draft vide ; RLS prouvée par un test | P0-01 → P0-07 |
| **1** | Spike Reveal | `reveal-api-observed.md` répond aux 10 questions ; FakeReveal reproduit les endpoints ; décision B/C écrite (ADR 0008 confirmée ou nouvelle ADR) | P1-01 → P1-03 |
| **2** | Connecteur Reveal en production, lecture seule puis envoi manuel | Les conversations Reveal s'affichent dans le dashboard en temps quasi réel (p95 < 60 s) ; un envoi manuel depuis le dashboard est vérifié ; session chiffrée ; kill switch ; réconciliation ; runbooks testés | P2-xx |
| **3** | Moteur IA en copilote | Chaque message entrant produit un draft avec brief, politique et gardes tracés ; évals `smoke` vertes ; Grok 4.7 vs Mistral comparés ; mémoire fan alimentée | P3-xx |
| **4** | Supervision | Inbox copilote clavier (approuver/éditer/rejeter en < 5 s), prise en main, notes, notifications SSE, dashboard de métriques (`operations.md`) | P4-xx |
| **5** | Mode auto progressif + PWA | Catégories auto-approuvées, horaires de vie, relances ; PWA mobile pour Messa (notifications de ventes et à-faire) ; éditeur de persona | P5-xx |
| **6** | Commerce | `offers`, échelle de prix et planchers en code, catalogue de médias décrits, anti-doublon, scripts en étapes, détection de ventes ; pont Imperium (export) | P6-xx |
| **7** | Instagram | Agent de veille et d'idées de reels avec apprentissage accepter/refuser ; réponses aux commentaires ; publication | P7-xx |
| **8** | Plateforme propre | `apps/platform`, `NirvanaPlatformConnector` in-process, paiements, conformité ; voir `architecture/own-platform.md` | P8-xx |

Transversal : sessions d'hygiène `H-xx` toutes les ~10 tâches ; revue du modèle de menaces à chaque phase ; test de restauration trimestriel ; rotation des secrets semestrielle.

## Ce qui dépend de Charles

- Accès créatrice Reveal (phase 1).
- Lecture des CGU Reveal sur l'automatisation (phase 1, décision B/C).
- Dépôt GitHub privé `LeyZee/nirvana` créé le 16/10/2026 ; rotation des secrets Imperium en attente de Charles.
- Clés API xAI, Mistral (phase 3).
- Persona réelle de Messalina hors dépôt (phase 3).
- Compte Neon, VPS Hetzner, Cloudflare (phase 2).
