# Mémoire par fan : coder le module `fans`
Statut : proposed
Phase : 3
Dépend de : P0-03, P0-05, P0-08
Branche : (à fixer à l'acceptation)

## Objectif
Coder la mémoire par fan déjà conçue (notes client structurées) pour que l'agent connaisse chaque fan pendant des mois sans relire tout l'historique.

## Contexte à lire
`docs/architecture/data-model.md` (§ Fans et mémoire, § Conversations, § Médias), `docs/architecture/ai-engine.md` (§ Contexte, § Le Brief, § La politique), `docs/architecture/message-flow.md` (§ Mémoire, `release`), `docs/conventions/security.md` (rétention), `docs/reference/persona-schema.md` (`strategies.kyc`), `docs/reference/onlychat-analysis.md`. Besoin métier : message de Charles du 17/10 à 17h18 (fil Revue) et `/mnt/project-files/onlychat/README.md` §3-4 (hors dépôt).

## Ce qui est déjà conçu, et ce qui manque
| Besoin de Charles | Déjà conçu | Manque, tranché ici |
|---|---|---|
| KYC (prénom, âge, métier, ville, couple, passions…) | `fans.kyc_state` (slots remplis), `fan_facts` catégorie `identity` / `life`, `kyc_missing` du brief, persona `strategies.kyc` | La liste fermée `KycSlot` : la persona ne porte plus de slots (P0-08), seulement des cibles en texte. Liste proposée : `first_name`, `age`, `city`, `country`, `job`, `relationship`, `children`, `hobbies`, `schedule`. |
| Faits appris | `fan_facts` (append-only, `declared` / `inferred`, confiance, source, expiration), `fan_summaries`, `fans.refresh_summary` | Rien. |
| Note libre de l'opérateur | `release(…, note)` écrit un `fan_fact` catégorie `operator_note` (`message-flow.md`) | `operator_note` absent de la liste des catégories de `data-model.md` : l'ajouter. |
| Scripts déjà envoyés | `media_sends` (un média payant n'est jamais revendu au même fan), `script_runs` réservé (phase 6) | Lecture « déjà envoyé à ce fan » exposée par `fans` pour le contexte ; l'écriture des `script_runs` reste en phase 6 (fiche catalogue). |
| Achats | `messages.is_paid`, `price_minor`, `sale_detected`, `listTransactions` du connecteur, `sales` réservé (phase 6) | Un résumé d'achats par fan calculé (total, nombre, dernier achat, plus haut palier acheté), sans table nouvelle, pour le contexte et la politique. |
| Limites du fan | `fans.flags` (jsonb, non spécifié), risques du brief (`distress`, `minor_suspected`…) | Clés fermées de `fans.flags`, lues par la politique avant toute offre : `age_confirmed` (date), `sales_frozen` (raison : `money_trouble`, `spending_limit`, `distress`, `operator`), `spending_limit_minor`, `no_explicit`, `do_not_contact`. Écrites par la politique (risque détecté) ou par un humain, jamais par le LLM seul. |

## À faire
- `packages/contracts` : `KycSlot`, `FactCategory` avec `operator_note`, `FanFlagsSchema` (clés ci-dessus), `FanPurchaseSummary`.
- Module `fans` (domain, application, infra, `index.ts`) : `proposeFacts(fanId, facts, evidence)` (append-only, remplace par `superseded_by`), `activeFacts(fanId)` (non remplacés, non expirés, triés catégorie puis confiance, 40 au plus), `kycState(fanId)`, `setFlag` / `clearFlag` (événement `domain_events`, auteur obligatoire), `purchaseSummary(fanId)`, `sentMediaIds(fanId)`.
- `assembleContext` lit `activeFacts`, le dernier `fan_summary`, `kycState`, `purchaseSummary` et les drapeaux. Les faits d'un fan n'entrent jamais dans le contexte d'un autre (garde « fuite d'un autre fan »).
- Écriture : les `facts_proposed` du brief deviennent des faits ; en copilote, l'approbation du draft les confirme (`fact_confirmed`).
- Politique : un drapeau `sales_frozen` ou `do_not_contact`, ou un âge non confirmé avant du contenu explicite, interdit l'offre (`policy_trace`).
- Rétention : job de purge des faits expirés (12 mois après le dernier contact, `security.md`).
- Docs : `data-model.md` (catégories, clés de `flags`), glossaire (« Drapeau du fan » : `fan_flag`).

## Critères d'acceptation
- Tests unitaires du domaine : remplacement d'un fait (Lyon en mai, Paris en août), expiration, tri et plafond de 40, calcul d'âge confirmé, résumé d'achats.
- Tests d'intégration (Testcontainers) : RLS, un fan ne voit jamais les faits d'un autre ni d'une autre créatrice.
- Évals : fan à découvert, fan qui fixe une limite de dépense, fan de 18 ans, fan qui revient après trois semaines (il est reconnu).

## Hors périmètre
Tables `offers`, `sales`, `scripts` (fiche catalogue), interface de la fiche fan dans l'extension, import de l'historique Reveal.

## Notes de session
