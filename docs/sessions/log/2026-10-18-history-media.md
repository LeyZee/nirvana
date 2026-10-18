# 2026-10-18 — Les médias du fan dans l'historique du moteur (B2) — done
Fait : B2 de la revue à froid, côté Bilan. Avant, l'ingestion jetait la liste des médias d'un message (`media_ids` restait vide) et l'historique lu par le moteur ne portait que du texte : une photo légendée « regarde » partait au moteur comme un simple texte et était traitée sans la vision (fail-open sur « vision obligatoire »). Maintenant, migration 0007 : `messages.platform_media` (jsonb, additif) garde les médias tels que la plateforme les liste, et `HistoryMessage.media` les donne au moteur (`kind`, `platformMediaId`, `isLocked`). Côté agent, `draft-composer.ts` passe la main à un humain dès qu'un message reçu depuis la dernière réponse porte un média, légendé ou non (`media_unscreened`), jusqu'à ce que le filtrage par la vision soit branché (P3-06). Doc : data-model.
Pas fait : brancher le filtrage par la vision sur ces médias (agent, P3-06) ; ranger les médias dans `media_assets` (module media, P3-04).
Décisions : on garde la référence de la plateforme, jamais une URL. Le refus en cas de doute porte sur tout message avec un média, pas seulement sur ceux sans texte.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test:all ✓.
