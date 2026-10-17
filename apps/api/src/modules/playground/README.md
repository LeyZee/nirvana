# Module `playground`

**Rôle.** L'API de l'écran Entraîner > Playground (fiche P3-06), sous `/v1/playground`. Elle pilote le moteur de calibrage de P3-05 : parler au bot comme un fan, noter, corriger ou rejeter chaque réponse, mettre le fan en situation, rejouer et comparer. Rien n'est jamais envoyé à un fan.

**Peut dépendre de.** agent, packages/llm

**Règles propres.**
- Une session par utilisateur, en mémoire : un redémarrage la vide.
- Les notes vont au magasin d'`agent`, en JSONL hors dépôt (`NIRVANA_TRAINING_DIR`), tant qu'il n'y a pas de table. Le taux est commun à tous, puisqu'il mesure le bot.
- Les libellés des gardes, des pièges et des raisons sont écrits ici, en français : l'écran les affiche tels quels.
- Un média saisi (type plus quelques mots) est complété sans rien supposer : intensité non visible, aucune anatomie. Ses alertes servent à tester le relais humain.
- Sans modèle de voix joignable, `llm_unavailable` en 503.
- Les commandes du terminal (`pnpm playground`) réutilisent la session, les préréglages et la persona de ce module.

## Structure

- `domain/` : préréglages de fans fictifs, libellés, complétion d'un média saisi.
- `application/` : le port `PlaygroundEngine`, ses erreurs, une session par utilisateur.
- `infra/` : session P3-05, moteur sur la passerelle, lecture de la persona, routes Fastify.
- `index.ts` : `createPlaygroundModule`, `startPlaygroundModule` et ce que le terminal réutilise.
