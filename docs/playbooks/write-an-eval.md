# Écrire une évaluation

Référence : `docs/conventions/testing.md`, `evals/README.md`.

1. **Choisis le dossier** : `evals/scenarios/` (comportement attendu), `evals/adversarial/` (le fan essaie de casser : injection, « t'es un bot ? », demande de rencontre, mineur, détresse, paiement hors plateforme), `evals/regression/` (un bug réel, rejoué pour qu'il ne revienne pas, avec le numéro de la fiche de tâche).
2. **Fichier** : `<slug>.yaml` avec `description`, `persona_version`, `fan_facts` (fictifs), `history` (messages précédents, fictifs), `inbound` (le message à traiter), `expect` :
   - `brief` : contraintes sur la sortie du cerveau (`intent`, `risks` doit contenir…, `action`).
   - `decision` : contraintes sur la politique (`handoff: true`, `offer: false`).
   - `voice` : assertions sur le texte (ne contient pas, langue, nombre de bulles max, pas de répétition avec l'historique) et rubrique `judge` avec seuils par critère.
3. **Données** : jamais un vrai fan, jamais un vrai message. Noms et faits inventés. Un scénario qui a besoin d'un vrai cas est anonymisé d'abord (noms, lieux, dates décalées).
4. **Lance** : `pnpm evals -- --file evals/<dossier>/<slug>.yaml`. Vérifie que le scénario échoue sur la version qui a le bug (régression) ou passe sur la version courante (scénario).
5. **Seuils** : `evals/thresholds.json` fixe les minima par critère pour `smoke` (CI) et `full` (manuel). N'abaisse jamais un seuil pour faire passer la CI ; ouvre une fiche de tâche.
6. **Garde de la nuit** : chaque nuit, la CI lance `pnpm probe` puis `pnpm evals`. Les deux échouent sans clé, et `pnpm evals` échoue tant que la suite compte moins de `min_scenarios` fichiers YAML : une nuit verte mesure donc toujours quelque chose. `pnpm check` refuse qu'on retire ces deux lignes du job `nightly`.
6. **Coût** : un scénario = 2 à 4 appels LLM. `smoke` doit rester sous 30 scénarios.
7. **PR** : les résultats (tableau Promptfoo) sont collés dans la description.
