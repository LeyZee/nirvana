# 2026-10-19 — Vision sur tout média avant le brouillon (revue 09, B2, part agent) — in_progress
Fait :
- `draft-composer.ts` : chaque média reçu depuis sa dernière réponse est vu (port `MediaSight`) avant le cerveau ; la description accompagne son message dans l'historique des modèles. Ce qui ne peut pas être vu (vision absente, verrouillé, note vocale, message vide, échec) passe la main à un humain (`media_unscreened` et la raison).
- Une alerte de la vision donne la cause la plus grave du passage de main (`handoffCauseOf`) : mineur, consentement, détresse, sinon autre.
- `createMediaSight({ fetchMedia, describer })` : récupère le fichier par le connecteur puis le fait décrire par le module `media` (cache par contenu) ; `startDraftComposer` accepte `sight`.
- Les médias déjà répondus ne sont pas revus (pas de coût en double).
Pas fait :
- Branchement en production : il manque `FetchMedia` côté connecteur Reveal (récupérer un média de fan par `platformMediaId`) ; d'ici là, tout média part chez un humain, comme avant.
- Le coût de la vision n'entre pas encore dans le coût du brouillon (il est journalisé et compté dans le plafond par la passerelle).
Décisions : aucune nouvelle ; défaut fermé (revue 09, B2).
Découvertes : les notes vocales des fans n'ont pas de chemin (transcription puis description) ; à décider avec P3-06.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓.
