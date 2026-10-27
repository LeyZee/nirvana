# P3-12 Note de désir : la tension sexuelle de chaque fan, et ne vendre que quand elle est haute
Statut : todo (ID validé par Charles le 27/10 à 20h37, carte « Les 5 sans capture, désir en tête »)
Phase : 3 (politique de l'agent)
Dépend de : P3-09 (curseur de sexualisation, livré), `offerDecision` (livré), P3-02 (mémoire et limites du fan) ; la note Reveal attend la capture (`setFanNote`), le reste se code sans capture ni clé
Branche : task/P3-12-desire-score

## Objectif
Chaque fan a une note de désir de 0 à 100, calculée par le code à chaque message à partir de signaux fermés, qui monte quand il s'échauffe et retombe quand il refroidit ou se tait. La politique s'en sert pour décider quand elle ouvre l'intime et quand un script peut partir ; le Suivi la montre avec ce qui l'a fait bouger.

## Contexte à lire
`apps/api/src/modules/agent/domain/sexualization.ts` (`sexualizationDecision`), `policy.ts` (`offerDecision`, `offerSignals`, `NO_SALE_RISKS`), `packages/llm/src/schemas.ts` (`BriefSchema`), `packages/contracts/src/persona.ts` (`strategies`, `PERSONA_BOUNDS`), `docs/architecture/ai-engine.md` (Le Brief, La politique), ADR 0018, 0021, 0023, 0025, méthode de chatting §2 et §3 (hors dépôt), `docs/reference/desirely-analysis.md` (§ Conversations).

## Ce que fait Desirely
Un niveau de désir par conversation (neutre, joueur, acheteur), affiché en colonne dans la liste des conversations, lié à ses phases (accroche, montée, vente, après-vente). Le centre d'aide montre le niveau, pas sa formule. Chez nous, la formule est du code, lisible et testée.

## Règle de fond
**La note ne fait que retenir.** Elle ajoute une condition aux décisions existantes et n'en retire aucune : âge déclaré par le fan, KYC minimum, « rien d'explicite », délai entre deux scripts, budget nul, gel, risques et `doNotContact` passent toujours avant. Une note haute ne lève jamais un délai ni une garde. Le modèle ne donne jamais le nombre : il relève des signaux dans une liste fermée, le code compte (règle 3).

## Calcul
1. **Signaux lus par le cerveau**, nouveau champ `desireSignals` du Brief, liste fermée, sur le dernier message du fan seulement :
   - qui réchauffent : il ramène lui-même vers l'intime (`steers_to_intimate`), compliment physique ou sensuel (`body_compliment`), question sur son corps ou sa tenue (`asks_about_her_body`), il dit ce qu'il désire ou ressent (`states_desire`), langage explicite (`explicit_language`), réaction chaude à un média ou un teaser (`hot_media_reaction`), jeu de rôle (`roleplay`), demande de média (intention `asks_for_media`, déjà là) ;
   - qui refroidissent : il change de sujet (`changes_subject`), réponse sèche (`cold_reply`), contrainte du moment (travail, pas le temps, quelqu'un à côté : `busy_now`), il freine ou refuse (`slows_down`), gêne (`discomfort`).
2. **Signaux mesurés par le code, sans modèle** : longueur de sa réponse rapportée à sa médiane, vitesse de réponse (moins de deux minutes : plus ; plus d'une heure : moins), emojis suggestifs pris dans une liste fermée en code (🔥 😈 😏 🥵 💦 🍑 🍆 👅 🤤), messages à la suite sans attendre sa réponse.
3. **Cumul et retombée** : chaque message du fan ajoute ou retire des points selon des poids versionnés en code (`DESIRE_WEIGHTS_VERSION`), bornés à 0 et 100. Sans message de lui, la note retombe de moitié toutes les 90 minutes vers un plancher : 0, ou 20 s'il a acheté dans les sept derniers jours (lu dans `sales`, à 0 tant que P6-01 manque). Un message de la créatrice ne fait jamais monter la note.
4. **Trois bandes** : neutre (0 à 39), joueur (40 à 69), chaud (70 à 100).
5. **Risques** : un risque de `NO_SALE_RISKS` fige la note et la met hors jeu ; `minor_suspected` ou `ageDisputed` la remet à 0.
6. **Traçabilité** : chaque calcul est un événement `desire_scored` du journal de la conversation (note avant, note après, signaux, version des poids), projeté sur la conversation (`desire_score`, `desire_band`, `desire_at`) ; migration attribuée par Bilan.

## Avec le curseur (P3-09) et `offerDecision`
- **Ouvrir l'intime elle-même** : en plus du délai `initiate_after_hours`, la note doit être au moins « joueur » (`strategies.sexualization.min_desire_to_open`, défaut 40, réglable de 20 à 70). Le suivre quand il y va reste la règle actuelle : âge déclaré, KYC minimum, `noExplicit`.
- **Proposer un script** : nouveau motif `low_desire` dans `offerDecision`, vérifié après le délai entre deux scripts et le budget nul : un script ne part que si la note est au moins au seuil de la créatrice (`strategies.script_launch.min_desire`, défaut 70, réglable de 50 à 90). Un fan qui demande lui-même du payant (`fanAsksForPaid`) lève cette condition comme aujourd'hui, jamais un risque ni l'âge.
- **Pendant une vente** : si la note retombe sous 40, la conversation revient au relationnel (règle « vente qui s'enlise » de `PROPOSED-sale-steps-rules.md`).
- **Le composeur** reçoit la décision de la politique et la bande comme indication de ton, jamais le nombre ; rien de la note n'est dit au fan.

## Où elle se voit
- **Suivi** (propriétaire, manager ; chatteur pendant son shift seulement, ADR 0025) : colonne « Désir », jauge discrète, bande et tendance (monte, descend) ; tri « chauds d'abord ». Pas de rouge : le rouge reste aux urgences.
- **Lecteur de conversation** : la courbe de la note au fil des messages et, au survol d'un point, les signaux qui l'ont fait bouger (« il ramène vers l'intime, réponse longue, 🔥 ×2 : +14 »).
- **Note du fan dans Reveal** : une ligne « Désir : chaud (72), 27/10 21 h 14 », écrite seulement quand la bande change, derrière la garde d'écriture (`connector_config.writes`, ADR 0018), pour les chatteurs qui travaillent dans Reveal.
- **Jamais** chez la créatrice (ADR 0023), jamais sur Telegram avec des données du fan (ADR 0020).

## À faire
- [ ] `desireSignals` dans `BriefSchema` et le prompt du cerveau (le message du fan reste une donnée, règle 4) ; relecture Bilan pour `packages/llm` et `packages/contracts`.
- [ ] `agent/domain/desire.ts` : `desireScore(previous, signals, measured, elapsed)` pur, poids et liste d'emojis versionnés ; tests.
- [ ] Champs de persona `min_desire_to_open` et `min_desire` avec leurs bornes ; valeurs de la persona `personas/demo`.
- [ ] `sexualizationDecision` et `offerDecision` lisent la note ; motif `low_desire` et sa raison lisible dans `apps/web/src/agent/causes.ts`.
- [ ] Événement `desire_scored`, projection, migration (Bilan).
- [ ] Affichage Suivi et lecteur (Extension), réglages des deux seuils dans l'écran Persona.
- [ ] Ligne de la note Reveal (après la capture, contre `FakeReveal` d'abord).
- [ ] Calibration hors dépôt sur le corpus de vente (`/mnt/project-files/onlychat/corpus-vente/`) : la note juste avant chacune des ventes et avant chaque refus ; les chiffres agrégés vont au journal, jamais un message.

## Critères d'acceptation
- Tests du domaine : retombée à mi-vie ; bornes 0 et 100 ; un message de la créatrice ne fait rien ; risque qui fige ; `minor_suspected` qui remet à 0 ; pour toute note, aucune offre sans âge confirmé, pendant le délai, sous budget nul ou sur un risque (test par propriétés) ; `fanAsksForPaid` lève `low_desire` et rien d'autre.
- Évals : fan qui s'échauffe sur dix messages (l'offre n'arrive qu'en bande « chaud ») ; fan qui flirte une fois puis parle de son travail (aucune offre) ; fan chaud qui dit « je suis au boulot » (la note baisse, pas d'offre).
- `pnpm check`, `pnpm test`, `pnpm evals` sans régression.

## Hors périmètre
Le routage vers un chatteur selon la note (`PROPOSED-hybrid-routing-by-value.md`), les phases du Suivi (`PROPOSED-tracking-sales.md`, qui lira cette note pour sa colonne « Désir »).

## Notes de session
