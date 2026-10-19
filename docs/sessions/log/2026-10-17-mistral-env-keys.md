# 2026-10-17 — Clés Mistral et Venice lues en développement, message des clés de chiffrement — done
Fait : en développement, le serveur lit `LLM_MISTRAL_API_KEY` et `LLM_VENICE_API_KEY` (`config.ts`, composition root) et les donne à la passerelle LLM comme les autres clés de `.env`. Le relais de l'écriture marche donc aussi en local quand Grok ne répond pas. En production, seules les clés collées dans Réglages › Modèles IA › Services comptent (ADR 0016). `parseEncryptionKeys` nomme la variable fautive (`CREDENTIALS_ENCRYPTION_KEYS` ou `SESSION_ENCRYPTION_KEYS`) au lieu de toujours citer `SESSION_ENCRYPTION_KEYS`, et ne recopie jamais la valeur. `.env.example` et la fiche P3-03 sont à jour.
Pas fait : rien.
Décisions : Venice est branchée en même temps que Mistral : aucun rôle ne s'en sert par défaut, mais un rôle réglé à la main sur elle trouve sa clé, et aucun écran ne la règle encore.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test:all ✓.
