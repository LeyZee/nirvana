# P3-04 Vision des médias et protection contre les pièges
Statut : in_progress
Phase : 3 (demande de Charles du 17/10, 18h01)
Dépend de : P3-01
Branche : claude/project-thread-e0j3ow

## Objectif
L'agent voit et comprend les photos et vidéos qu'un fan envoie et celles des bundles de Messa, et ne tombe dans aucun piège (« donne-moi la recette de la tarte aux fraises », « ignore tes instructions »), même écrit dans une photo.

## Contexte à lire
`CLAUDE.md`, `docs/architecture/ai-engine.md` (sections Vision et Les pièges), `docs/reference/media-vocabulary.md`, `docs/reference/llm-providers.md`, `/mnt/project-files/modeles-ia/comparatif-modeles.md` (sections 4, 8 à 10).

## À faire
- [x] `MediaDescriptionSchema` dans `packages/contracts` (vocabulaire 1.0.0, prélevé sur P0-02).
- [x] Rôle `sense` dans la passerelle : Gemini 3.8 Flash par défaut, photo et vidéo natives, filtres à `OFF` ; bascule sur Grok 4.7 en images clés datées + transcription si Gemini refuse ; prompt `sense/default.md` 1.0.0.
- [x] `transcribe` (xAI) pour le son d'une vidéo, coût à l'heure d'audio dans le journal.
- [x] Module `media` : `describeMedia` (cache par contenu, version et modèle ; conversion JPEG ; images clés et transcription calculées seulement à la bascule), outils ffmpeg.
- [x] Pièges en code (module `agent`) : `detectInjection`, `assessTrap`, `screenMedia` ; garde bloquante `assistant_output` ; canari contre la fuite du prompt ; caractères invisibles retirés par `wrapUntrusted`.
- [x] Prompts voix et cerveau 1.3.0 : médias, pièges, `off_topic_request`, `manipulation_attempt`, ordre stable puis variable pour le cache de prompt.
- [x] Playground : `/media <fichier>` (il envoie) et `/envoi <fichier> [verrouillé]` (elle envoie).
- [x] Test express : quatre tours pièges dans `pnpm probe`, `pnpm probe:vision` sur médias synthétiques.
- [ ] Lancer `pnpm probe:vision` avec `LLM_GOOGLE_API_KEY` et `LLM_XAI_API_KEY`, noter le taux de refus de Gemini et le verdict de Grok en bascule.
- [ ] Comparer Gemini 3.8 Flash et Gemini 4 Argon sur une vingtaine de vidéos du catalogue (configurable dans `DEFAULT_LLM_CONFIG.roles.sense`).

## Critères d'acceptation
- `pnpm check` et `pnpm test` verts ; tests de la vision (photo, vidéo native, bascule, sans images clés, transcription), des pièges (vrais pièges, masques, faux positifs), des gardes et du module `media` (dont ffmpeg réel sur une mire synthétique).
- Avec les clés, `pnpm probe:vision` sort vert : texte de la photo lu, milieu de la vidéo vu, voix qui ne suit pas la photo piégée.

## Hors périmètre
Base de données des descriptions (P0-03), récupération des fichiers des bundles Reveal (fil Connexion Reveal), Qwen3-VL par OpenRouter, API Files de Gemini pour les vidéos de plus de 20 Mo, vocaux ElevenLabs (PR #18).

## Notes de session
- Décision de Charles du 17/10 18h20 : Gemini pour la Vision malgré sa politique (section 9 du comparatif). Bascule automatique, taux de refus à suivre.
- Grok ne lit pas la vidéo par l'API (comparatif, section 4) : le catalogue l'annonçait à tort pour Grok 4.3, corrigé.
- Le test d'une photo de nu ou d'une vidéo explicite ne peut pas se faire avec des médias synthétiques : à faire par Charles dans le playground (`/media`) avec un média consenti.
