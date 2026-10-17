# Le chemin d'un message

Dernière revue : 2026-10-16.

## 1. Entrée

```
Plateforme ──(poll toutes les N s, ou WebSocket)──▶ Connector.listConversations / fetchMessages
                                                        │
                                                        ▼
                                   conversations.ingestMessage(cmd)      [transaction]
                                     • upsert fan (platform_fan_id)
                                     • upsert conversation
                                     • INSERT message  (UNIQUE platform_message_id → doublon = no-op silencieux)
                                     • event message_received
                                     • si inbound : addJob('conversation.respond', { conversationId },
                                         { queueName: 'conv:'+id, jobKey: 'respond:'+id, jobKeyMode: 'replace',
                                           runAt: now + debounceFor(conversation, persona) })
                                     • annule le follow_up en attente (jobKey replace avec runAt = null, ou flag)
```

Le debounce (30 à 90 s, selon la persona et l'heure) fait qu'un fan qui envoie trois messages d'affilée obtient une seule réponse qui les prend tous en compte. Le `queueName` garantit qu'aucun autre job ne touche la conversation en même temps.

## 2. Le job `conversation.respond`

Exécuté par le worker, strictement en série par conversation :

```
0. Garde-fous d'entrée : kill switch ? mode human/paused ? session plateforme expirée ? → event + sortie
1. Contexte  = assembleContext(conversationId)                          [lecture]
     persona active (version), faits actifs du fan, résumé, N derniers messages (budget de tokens),
     médias entrants non décrits, état cooldowns/script, heure locale créatrice
2. Sens      = pour chaque média entrant sans description → media.describe (job séparé si > 1, puis re-enqueue respond)
3. Cerveau   = llm.brain(context) → Brief (Zod) : intent, sentiment, facts_proposed[], kyc_missing[],
               risks[], action (reply|offer|wait|follow_up|handoff), reply_brief, tone_hints
4. Politique = policy.evaluate(context, brief) → Decision (code pur, testé) :
               • risques bloquants (mineur suspecté, détresse, rencontre, paiement hors plateforme, litige) → handoff
               • action offer autorisée ? (cooldowns, droits média, phase 6 : prix/plancher)
               • horaires de la persona (hors horaires → wait + runAt)
               • identity_policy si brief.intent == 'asks_if_bot'
               • KYC : au plus une question, seulement si naturel
5. Voix      = llm.voice(context, decision) → bubbles[] (texte, découpage, emojis selon persona)
6. Gardes    = guards.check(bubbles, context, decision) → ok | violations[]
               • dégoûts/mots interdits (persona), anti-répétition (N derniers envois), longueur,
                 mention d'argent hors offre, mention IA/prompt/système, données d'un autre fan,
                 URL/coordonnées, langue
               → violation : une régénération avec le retour des gardes, puis échec = draft 'failed' + notification
7. Draft     = INSERT drafts (brief, bubbles, versions, traces) + event draft_created
8. Suite     = mode copilot → notify supervision (SSE) ; mode auto et catégorie autorisée → approveDraft(system)
```

Chaque étape écrit sa trace (`policy_trace`, `guard_trace`) sur le draft : on peut toujours répondre à « pourquoi le bot a dit ça ».

Code actuel : les étapes 1 à 6 sont derrière le port `DraftComposer` (module `conversations`), implémenté par l'adaptateur de l'agent. Le job se déroule en trois temps, pour ne garder aucun verrou pendant que le moteur réfléchit :

- Une transaction en lecture : gardes d'entrée, état `pending`, 40 derniers messages, contexte du fan.
- `compose` hors transaction.
- Une transaction qui re-verrouille la conversation. Si le fan a réécrit entre-temps (`last_inbound_at` a bougé), ou si une garde s'est fermée, le résultat est jeté et le prochain debounce répond.

Le moteur peut aussi ne pas écrire de brouillon (`held`) :

- `guard_blocked`, `handoff`, `budget_reached` et `llm_unavailable` donnent `handoff_requested` : la conversation passe à `human` et les chatteurs reprennent. Un modèle injoignable (fournisseur en panne, clé absente) ne laisse donc plus un fan sans réponse ni alerte : la cause `llm_unavailable` part en alerte « Important ».
- `no_reply` donne `reply_skipped` et la conversation revient à `idle`. Les anciens `reply_skipped` de raison `llm_unavailable` restent lisibles.

Le job n'envoie jamais rien lui-même.

## 3. Approbation et envoi

```
approveDraft(draftId, by)  [transaction]  → status approved|edited, event, addJob('conversation.send', …, queueName conv)
rejectDraft(draftId, by, reason)          → status rejected, event ; raison stockée pour les évals

conversation.send :
  • relit le draft (encore valide ? conversation toujours en idle/awaiting ? pas de nouveau message inbound depuis ? sinon → expired + re-respond)
  • humanisation : délai de frappe ∝ longueur, jitter ; bulles envoyées une à une avec intervalle
  • pour chaque bulle : Connector.sendText(conversationId, text, idempotencyKey = draft.id + ':' + index)
  • event send_attempted → send_verified (Connector.verifySent relit la conversation) ou send_failed
  • INSERT messages (outbound, author ai|human, draft_id)
  • échec : retry borné (3) ; au-delà → draft failed, notification, conversation en error jusqu'à action humaine
```

Mode auto : `CreatorSettings.auto_approve_categories` (ex. `['small_talk','kyc','media_reaction']`) ; tout le reste reste copilote. Le passage en auto est progressif (roadmap phase 5).

## 4. Après l'envoi

- **Mémoire** : les `facts_proposed` du brief deviennent `fan_facts` avec `kind` et `confidence` ; en copilote, l'approbation du draft vaut confirmation. Tous les N messages (config), job `fans.refresh_summary`.
- **Relance** : si `decision.follow_up_in` est défini, `addJob('conversation.follow_up', …, { jobKey: 'follow_up:'+id, runAt })`. Un message entrant annule la relance.
- **Ventes** (phase 6) : `sale_detected` vient du connecteur (poll des transactions ou message typé) et met à jour `media_sends`, `sales`.

## 5. Prise en main humaine

- `takeover(conversationId, by)` : state `human`, event, le bot ne génère plus. L'humain écrit depuis le dashboard (envoi via le même `conversation.send`, `author: human`).
- `release(conversationId, by, note?)` : state `idle`, la note est ajoutée en `fan_fact` catégorie `operator_note`, le bot relit tout l'historique à sa prochaine réponse.
- `handoff` demandé par la politique : state `human` + notification urgente ; la conversation ne redevient automatique qu'à `release`.

## 6. Interrupteurs

`kill_switches` à trois niveaux. Le job `respond` et le job `send` les relisent à chaque exécution. L'approbation d'un brouillon les relit aussi : interrupteur actif ou session expirée, elle est refusée (409 `kill_switch_conflict` ou `session_expired_conflict`) et le brouillon reste en attente. Le job `send` les relit avant chaque bulle : un brouillon arrêté ainsi expire, et rien ne repart tout seul quand l'interrupteur est levé. Un interrupteur « envois seulement » existe : le bot continue de proposer (copilote), rien ne part.

## 7. Réconciliation

Job `connector.reconcile` toutes les 10 min : relit la liste des conversations et les N derniers messages de celles actives, compare avec la base, ingère ce qui manque (idempotent), marque les envois non retrouvés comme `send_failed` si plus vieux que 5 min. C'est le filet de sécurité contre les messages perdus et les envois fantômes.

## 8. Invariants (testés)

1. Deux jobs `respond` ne s'exécutent jamais en parallèle pour la même conversation.
2. Un `platform_message_id` n'est inséré qu'une fois.
3. Un draft ne part que si aucun message inbound n'est arrivé après sa création.
4. Aucune bulle n'est envoyée deux fois (idempotency key).
5. Un draft envoyé a toujours `persona_version_id` et `prompt_hashes`.
6. Une violation de garde bloquante n'est jamais envoyée, même en mode auto.
7. En mode `human`, `paused` ou kill switch actif, aucun appel LLM n'est fait.
