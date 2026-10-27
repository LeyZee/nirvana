# Gardes de voix : ce que Desirely et son playbook interdisent et que nous laissons passer
Statut : proposed (ID à donner par Charles ; née de l'étude de Desirely du 27/10)
Phase : 3
Dépend de : rien de bloquant (ni capture ni clé : les gardes sont du code pur, les évals tournent dès la clé xAI)
Branche : task/<id>-voice-guards

## Objectif
Ajouter aux gardes de `checkVoiceOutput` les fautes de voix que Desirely corrige déjà, pour qu'aucune ne parte chez un fan, que le brouillon vienne de l'agent ou d'un humain (G5).

## Contexte à lire
`apps/api/src/modules/agent/domain/guards.ts` (`BLOCKING_PATTERNS`, `checkVoiceOutput`, `meeting_promise`, `forbidden_term`), `docs/architecture/ai-engine.md` (Les gardes), ADR 0021, méthode de chatting §5 (hors dépôt), `docs/reference/desirely-analysis.md` (§ Voix).

## Gardes à ajouter
1. **`stage_direction`** (bloquante) : didascalies et actions entre astérisques ou parenthèses (« *sourit* », « (rires) », « *t'envoie un bisou* ») ; Desirely le documente comme un défaut à corriger. Les emojis restent permis.
2. **`media_not_sent`** (bloquante) : la bulle annonce un envoi (« je t'envoie une photo », « regarde ce que je viens de t'envoyer ») alors que le brouillon ne porte aucun média ; l'inverse, un média joint sans phrase qui l'amène, reste permis.
3. **`platform_meeting_word`** (bloquante) : les mots que les plateformes repèrent même dans un refus (« rdv », « rendez-vous », « rencontre réelle », « se rencontrer », « IRL », « se voir en vrai » et leurs variantes ; « en vrai » seul reste permis, c'est un tic de langage) ; la garde `meeting_promise` bloque la promesse, celle-ci bloque le mot. La liste est une donnée versionnée en code, enrichie avec la capture Reveal.
4. **`fake_emergency`** (bloquante) : maladie, accident, hôpital, urgence, loyer, dette pour pousser une vente (le playbook l'interdit, p. 57 et 71 du PDF) ; un fait de vie neutre (« je suis crevée ») reste permis.
5. **`repetition`** (avertissement puis bloquante après calibration) : une bulle déjà envoyée à ce fan dans les vingt derniers messages, ou la même ouverture trois fois de suite (« coucou toi », « hey bébé ») ; comparaison sur le texte normalisé, sans modèle.
6. **`closed_question_streak`** (avertissement) : trois questions fermées de suite dans la découverte (le playbook demande de rebondir et d'ouvrir) ; sert la calibration, ne bloque pas.

## À faire
- [ ] Les six codes dans `GuardCode`, leurs motifs et leurs tests (un cas qui passe, un cas bloqué, un faux positif connu par garde).
- [ ] La raison lisible de chaque garde dans `apps/web/src/agent/causes.ts`.
- [ ] Scénarios d'éval : refus de rencontre sans mot repéré, média annoncé sans pièce, relance sans répétition.

## Critères d'acceptation
- `pnpm check`, `pnpm test` verts ; aucune garde existante affaiblie ; les évals existantes ne régressent pas.

## Hors périmètre
Le style (longueur, emojis, tics) déjà couvert par `bubble_too_long`, `too_many_bubbles` et la persona.

## Notes de session
