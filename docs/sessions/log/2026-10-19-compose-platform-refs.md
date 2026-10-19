# 2026-10-19 · Références plateforme pour la vision (Bilan)

Fait : `conversation.respond` donne au composeur `platformAccountId` et `platformConversationId`, et chaque message de l'historique porte son `platformMessageId`. Ce sont les champs facultatifs de `AgentComposeInput` (#81). Sans eux, tout média passait la main avec la raison `no_platform_ref`. Le test d'intégration du composeur vérifie les quatre références d'une photo.

Pas fait : le branchement `createMediaSight({ fetchMedia, describer })`. Il attend `FetchMedia`, que le lot A Reveal implémentera après la capture.

Décisions : les champs sont obligatoires dans `ComposeInput` et `HistoryMessage` côté `conversations`, qui les a toujours, et restent facultatifs côté agent (correspondance par forme).

Découvertes : aucune.

Candidats à suppression : aucun.

Vérifié : `pnpm check`, `pnpm test`, intégration conversations et Dashboard.
