# 0016. Les clés des fournisseurs IA se saisissent dans le dashboard, chiffrées en base

Statut : accepted (Charles, 2026-10-17 18h49)
Date : 2026-10-17

## Contexte

La passerelle LLM (P3-01) lit les clés des fournisseurs dans l'environnement du serveur (`LLM_<PROVIDER>_API_KEY`), comme le prévoit l'étape 9 du playbook `add-an-llm-provider.md`. Charles veut connecter Grok (xAI), Gemini (Google) et ElevenLabs depuis le dashboard, dans Réglages › Modèles IA, avec un parcours guidé et vérifié, sans toucher à Coolify. Le parcours (écrans, textes, erreurs) est décrit dans la fiche P3-03.

## Décision

1. **Saisie dans le dashboard.** Les clés des fournisseurs (xAI, Google, ElevenLabs, puis Mistral et Venice) se collent dans Réglages › Modèles IA. Seul un utilisateur `owner` peut connecter, remplacer ou déconnecter, avec une ré-authentification si sa session a plus de 10 minutes.
2. **Vérifiée avant d'être gardée.** Une clé n'est enregistrée qu'après un appel de vérification réussi auprès du fournisseur. Remplacer une clé garde l'ancienne active tant que la nouvelle n'est pas vérifiée.
3. **Chiffrée en base.** Table `provider_credentials`, une ligne par fournisseur, réglage de l'agence : pas de `creator_id`, hors RLS, lue et écrite seulement via `withAdmin` par le module de réglages et la passerelle. Chiffrement AES-256-GCM avec le même mécanisme que les sessions plateforme (`docs/conventions/security.md`) et une clé distincte : `CREDENTIALS_ENCRYPTION_KEYS`, versionnée (`v2:<nouvelle>,v1:<ancienne>`), dans l'environnement chiffré de Coolify.
4. **Écriture seule.** Aucune route ne renvoie une clé, même masquée. L'interface montre l'état (connecté, à reconnecter, crédits bas), le nom de la clé quand le fournisseur en donne un et la date de vérification. Les clés sont retirées des logs (redaction Pino) et n'entrent jamais dans `llm_calls`.
5. **L'environnement devient un repli de développement.** `LLM_<PROVIDER>_API_KEY` et `SPEECH_ELEVENLABS_API_KEY` ne sont lues que hors production (`pnpm probe`, `pnpm playground`, dev local). En production, seule la base fait foi.
6. **Gemini par clé d'API.** Gemini est appelé par l'API Gemini avec une clé créée dans Google AI Studio, sur un projet dont la facturation est active (en offre gratuite, Google peut conserver les contenus envoyés). Le compte de service Vertex (`GOOGLE_VERTEX_*`, `ai-engine.md`) ne se colle pas dans un champ ; il n'est plus la voie prévue.
7. **L'extension ne porte aucune clé de fournisseur.**

## Conséquences

- Une seule surface pour gérer les clés, avec vérification à la saisie, revérification périodique et bascule immédiate sur un 401 ou un 403 réel.
- Une fuite de la base seule ne livre pas les clés ; une fuite de la base et de l'environnement du serveur, oui. La clé maître se tourne comme `SESSION_ENCRYPTION_KEYS` (`docs/runbooks/rotate-secrets.md`).
- La passerelle lit déjà une source de clés synchrone (`ApiKeySource`, PR #19) ; le magasin `CredentialStore` la fournit. `.env.example`, `ai-engine.md` et `rotate-secrets.md` sont alignés par la fiche P3-03.
- À surveiller : si Nirvana sert un jour plusieurs agences, `provider_credentials` prendra une colonne d'agence et une politique RLS.

## Alternatives rejetées

- **Variables d'environnement seulement** : chaque changement de clé passe par Coolify et un redéploiement, sans vérification ni message clair ; contraire à la demande de Charles.
- **Coffre externe (Vault, Infisical)** : plus solide, mais un service de plus à héberger et à sauvegarder pour cinq clés. À reconsidérer avec plusieurs agences.
- **Clé stockée dans l'extension ou le navigateur** : lisible sur le poste ; exclu.
