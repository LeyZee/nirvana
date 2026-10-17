# Module `providers`

**Rôle.** Connecter, vérifier, remplacer et déconnecter les clés des services IA (xAI pour Grok, Google pour Gemini, ElevenLabs pour les vocaux) depuis Réglages › Modèles IA, et les fournir à la passerelle LLM (ADR 0016, fiche P3-03).

**Peut dépendre de.** Aucun module. `packages/contracts` ; l'infra parle aux API des fournisseurs (lecture seule).

**Tables possédées.** `provider_credentials` (à venir avec P0-03 : clé chiffrée par `CREDENTIALS_ENCRYPTION_KEYS`, hors RLS, réglage de l'agence).

**Jobs émis.** Revérification des clés toutes les 15 minutes (à câbler avec P0-04).

## Règles propres

- Une clé n'est enregistrée qu'après une vérification réussie ; un remplacement refusé laisse l'ancienne clé en place.
- Aucune fonction publique ne renvoie une clé, sauf `apiKeySource`, lue en mémoire par la passerelle et le client vocal.
- Une seule table de textes (`domain/messages.ts`) : la feuille, la ligne, le bandeau et le journal disent la même chose pour le même problème. Jamais de code HTTP à l'écran.
- Un fournisseur injoignable ne dit rien de la clé : l'état ne change pas.
- Un refus sur un vrai appel (401, 403) passe le service à « à reconnecter » tout de suite (`reportRefusedKey`).

## Structure

- `domain/` : profils des services, forme des clés, textes, états, prochaine action. Pur, testé.
- `application/` : connexion, revérification, déconnexion, réglages (voix, modèle Vision), cache des clés.
- `infra/` : un vérificateur par fournisseur (un `GET` en lecture seule, réponses validées par Zod), dépôt en mémoire. Le dépôt Postgres et les routes arrivent avec P0-03, P0-04 et P0-07a.
- `index.ts` : `createProvidersModule(deps)`, seule porte d'entrée.

Les chemins d'API des fournisseurs (`/v1/api-key` chez xAI, `/v1beta/models` chez Google, `/v1/user/subscription` et `/v1/voices` chez ElevenLabs) sont à reconfirmer avec une vraie clé lors de la première connexion.
