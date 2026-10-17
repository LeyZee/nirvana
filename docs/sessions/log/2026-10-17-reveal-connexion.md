# 2026-10-17 — Connexion Reveal (fil projet, hors fiche) — done

Fait : inventaire des capacités du connecteur Reveal (`docs/reference/reveal-connector-inventory.md`), méthode de capture HAR pour Charles (`docs/runbooks/reveal-recording.md`), anonymiseur sans dépendance `scripts/anonymize-har.mjs` et ses 8 tests (`pnpm test:scripts`, branché dans `pnpm test`), spécification de FakeReveal (`docs/reference/fake-reveal.md`), fiche proposée `PROPOSED-reveal-connector.md`. Questions 11 à 14 (scripts natifs, historique, notes client, âge) ajoutées à `connectors.md` et au gabarit `reveal-api-observed.md`. Glossaire : script natif, note client, coffre, capture, fan test.
Pas fait : connecteur réel et FakeReveal (aucune capture n'existe encore, consigne du coordinateur).
Décisions : la capture HAR des outils de développement de Chrome débloque P1-02 sans attendre l'enregistreur P1-01, qui reste utile pour les captures suivantes et la capture de session. Les capacités propres à Reveal deviennent des méthodes optionnelles du port, annoncées par `capabilities` (à confirmer dans la fiche proposée).
Découvertes : ADR 0008 parle encore de « 10 questions » (non modifiée, ADR acceptée) ; le module `scripts` de la phase 6 doit devenir un lecteur de scripts natifs (revue du cap, non traité ici).
Candidats à suppression : aucun.
Vérifié : voir la PR.
