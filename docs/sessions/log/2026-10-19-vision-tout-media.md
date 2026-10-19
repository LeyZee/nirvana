# 2026-10-19 — Vision sur tout média avant le brouillon (revue 09, B2, part agent) — done
Fait :
- `draft-composer.ts` : chaque média reçu depuis sa dernière réponse est vu (port `MediaSight`) avant le cerveau ; la description accompagne son message dans l'historique des modèles. Ce qui ne peut pas être vu (vision absente, verrouillé, note vocale, message vide, échec) passe la main à un humain (`media_unscreened` et la raison).
- Une alerte de la vision donne la cause la plus grave du passage de main (`handoffCauseOf`) : mineur, consentement, détresse, sinon autre.
- `createMediaSight({ fetchMedia, describer })` : récupère le fichier par le connecteur puis le fait décrire par le module `media` (cache par contenu) ; `startDraftComposer` accepte `sight`.
- Les médias déjà répondus ne sont pas revus (pas de coût en double).
- Relecture à froid : une description « non visible » ou incertaine passe la main (`not_visible`, `confidence_low`) ; une panne du module `media` donne `describe_failed` au lieu d'une exception ; la vision passe avant le test de la clé voix, pour qu'une alerte garde sa cause ; `no_media_id` (devenu `no_platform_ref`) quand la plateforme n'a pas donné d'identifiant.
Pas fait :
- Relecture du fil Connexion Reveal : `MediaToSee` porte `platformAccountId`, `platformConversationId` et `platformMessageId` (lien signé qui expire) ; `FetchMedia` rend `Result<fichier, 'gone' | 'locked' | 'too_large' | 'unsupported'>` ; `createMediaSight` plafonne à 20 Mo et lit le type dans les octets (`sniffMediaType`, module `media`) ; `no_media_id` devient `no_platform_ref`.
- Branchement en production : il manque `FetchMedia` côté connecteur Reveal (récupérer un média de fan par `platformMediaId`) ; d'ici là, tout média part chez un humain, comme avant.
- Le coût de la vision n'entre pas encore dans le coût du brouillon (il est journalisé et compté dans le plafond par la passerelle).
Décisions : aucune nouvelle ; défaut fermé (revue 09, B2).
Découvertes : au-delà de 40 messages du fan depuis sa dernière réponse (`HISTORY_LIMIT`), les plus anciens et leurs médias ne sont pas lus ; et toute réponse sortante, même écrite par un humain, compte comme « sa dernière réponse ». Rare, hérité, à trancher avec Bilan (conversations). Les notes vocales des fans n'ont pas de chemin (transcription puis description) ; à décider avec P3-06. `conversation.respond` (module conversations, Bilan) doit encore passer `platformAccountId`, `platformConversationId` et `platformMessageId` au composeur ; sans eux, tout média passe la main (`no_platform_ref`).
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓.
