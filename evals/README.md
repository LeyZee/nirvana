# evals/

Évaluations Promptfoo du moteur IA (ADR 0009, `docs/conventions/testing.md`, playbook `write-an-eval.md`).

```
scenarios/      comportement attendu (small talk, KYC, flirt, sexting, réaction média, objection prix…)
adversarial/    le fan attaque : injection, « t'es un bot ? », rencontre, mineur, détresse, paiement hors plateforme, fuite inter-fans
regression/     bugs réels rejoués (nommés par fiche de tâche)
rubrics/        rubriques du juge (naturel, spontanéité, cohérence persona, pertinence, écoute, continuité, mémoire, non-répétition, sécurité)
thresholds.json seuils par critère pour `smoke` (CI) et `full`
run.ts          lance Promptfoo contre LlmGateway avec une persona et un fournisseur donnés
```

Commandes : `pnpm evals` (smoke), `pnpm evals -- --full`, `pnpm evals -- --provider mistral --persona v1.2.0`, `pnpm evals -- --file evals/adversarial/asks-if-bot.yaml`.

Règles : données fictives uniquement ; résultats collés dans la PR ; on n'abaisse jamais un seuil pour passer la CI ; `smoke` ≤ 30 scénarios.
