# Vocaux générés avec la voix clonée de la créatrice
Statut : proposed
Phase : 3 (après P3-01 ; envoi réel après le connecteur Reveal)
Dépend de : P3-01, P0-06 (port connecteur), décision Reveal sur l'envoi d'audio (PR #15)
Branche : task/<id>-voice-notes

## Objectif (1 phrase)

L'agent peut proposer, dans de rares moments choisis par le code (le fan doute que c'est elle, un moment fort), un vocal court généré avec la voix clonée de la créatrice, contrôlé automatiquement puis écouté par un opérateur avant l'envoi.

## Contexte à lire

- Note de recherche et de conception (hors dépôt, privée) : `/mnt/project-files/vocaux/recherche-et-conception.md`. Faits sourcés sur ElevenLabs (Eleven v4, 28/09/2026 ; clonage IVC/PVC ; prix ; politique d'usage).
- ADR 0009 (passerelle LLM), 0010 (persona hors dépôt), 0012 (`identity_policy`).
- `docs/architecture/ai-engine.md`, `docs/architecture/message-flow.md`, `docs/architecture/data-model.md` (`media_assets`, `llm_calls`).
- `docs/reference/llm-providers.md`.

## Décisions à prendre avant le code

- **Décidé par Charles (17/10/2026)** : les vocaux générés sont la seule exception à la règle « le bot n'envoie que du texte, des étapes de script et des notes, jamais de média libre ». Ils restent en copilote obligatoire (écoute humaine avant chaque envoi), avec le prénom du fan et des fréquences bornées par le code.
- **ADR proposé** : la passerelle de `packages/llm` gagne une capacité `speech` (synthèse vocale) à côté de `sense/brain/voice/judge` : même config par rôle, journal (`llm_calls.role = speech`, coût au caractère), santé (carte « Vocaux » du panneau Modèles IA), repli. Alternative : un package `speech` séparé. La session écrit l'ADR et s'arrête dessus si Charles ne l'a pas accepté.
- Plateforme : Reveal a un bouton micro natif dans la zone de saisie (capacité E7 de l'inventaire, PR #15) ; format, durée max et rendu côté fan attendent la capture HAR (étape 11c). La session n'implémente `sendVoiceNote` côté Reveal que si la capture confirme l'envoi et un rendu de vocal (pas de fichier joint). Si seul le micro donne ce rendu, le connecteur rejoue la requête du micro avec l'audio converti dans le même format (conversion `ffmpeg` chez nous).

## À faire (liste vérifiable)

1. **Contrats** : `VoiceNoteDecision`, `SpeechConfig` (`provider`, `model`, `voices: { day, night }`, plages de réglages), `AudioCheckReport` (Zod).
2. **Cerveau** : nouvel intent `doubts_identity` (distinct de `asks_if_bot`) ; nouvelle action `voice_note`.
3. **Politique** (code pur, testé) : vocal autorisé seulement si prénom du fan connu, plateforme qui déclare `supportsVoiceNotes`, au plus 1 vocal « doute » par fan sur 30 jours et 1 vocal par fan par semaine (réglages `CreatorSettings.speech`), jamais dans les N premiers messages, jamais pendant une vente, jamais avec signal mineur/détresse/argent difficile, jamais en mode `human`/`paused`, registre jour/nuit selon l'heure de la créatrice. Un fan qui doute encore après un vocal : pas de second vocal, déflexion écrite puis passage à l'humain.
4. **Voix** : prompt `packages/llm/prompts/voice/voice-note.md` (oral, 20 à 40 mots, prénom une fois, une référence concrète à la conversation, balises audio dans une liste blanche). Aucune donnée de la créatrice dans le prompt.
5. **Gardes orales** en plus des gardes existantes : pas d'emoji, d'URL, de chiffres ambigus ; balises de la liste blanche ; longueur ; anti-répétition par empreinte n-grammes contre les 200 derniers vocaux de la créatrice (tous fans confondus).
6. **Synthèse** : fournisseur ElevenLabs (`eleven_v4`) derrière l'interface `speech` ; clé `SPEECH_ELEVENLABS_API_KEY` (`.env.example`, config Zod) ; coût au caractère dans `catalog.ts` avec date et source ; jamais d'audio ni de texte dans les journaux.
7. **Contrôles audio automatiques** (bloquants, une régénération puis échec propre) : transcription aller-retour (taux d'erreur de mots ≤ 10 %, prénom retrouvé), durée 5 à 20 s, crête ≤ −1 dBFS, pas de silence > 1,5 s. Ressemblance du locuteur : optionnelle, derrière un drapeau.
8. **Prononciation du prénom** : graphie phonétique ou IPA saisie par l'opérateur, mémorisée en `fan_fact` (`name_pronunciation`) et réutilisée.
9. **Médias** : `media_assets` `kind = audio`, `origin = generated`, stockage objet privé, rétention configurable.
10. **Brouillon et copilote** : le brouillon porte le texte, l'audio et le rapport de contrôles ; l'opérateur écoute, approuve, régénère ou choisit un vrai vocal de la banque de repli. Aucun vocal en mode auto dans cette fiche.
11. **Connecteur** : `PlatformConnector.sendVoiceNote(conversationId, media, idempotencyKey)` + capacité `supportsVoiceNotes` ; `FakeReveal` l'implémente ; test de contrat.
12. **Playground** : même chemin, audio joué dans le navigateur, jamais envoyé.
13. **Glossaire** : « Vocal » = `voice_note`, « Synthèse vocale » = `speech`.

## Critères d'acceptation

- Tests unitaires de la politique couvrant chaque refus et chaque fréquence ; tests des gardes orales et de l'anti-répétition.
- Test d'intégration du chemin complet avec un fournisseur `speech` factice (audio de synthèse inventé) et `FakeReveal` : brouillon créé, contrôles exécutés, envoi idempotent.
- Évals (`evals/`) : scénarios « le fan doute » (doit proposer un vocal la première fois, pas la seconde), « fan sans prénom » (jamais de vocal), « mineur suspecté » (jamais).
- `pnpm check` et `pnpm test:all` verts.
- Aucun enregistrement, `voice_id` réel ou vocal généré dans le dépôt.

## Hors périmètre

- Vocaux sexy ou payants (bundle).
- Mode auto pour les vocaux.
- Clonage professionnel (PVC) et second fournisseur de synthèse.
- Création du compte ElevenLabs et du clone : fait par Charles, hors code.

## Notes de session
