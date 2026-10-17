# 0017. Vision : Gemini en natif, bascule sur Grok en images clés

Statut : accepted
Date : 2026-10-17

## Contexte

L'agent doit voir ce que les fans envoient (photos, vidéos, vocaux, y compris explicites) et ce que la créatrice vend, sinon le fan repère vite qu'il parle à une machine (Charles, 17/10, 18h01). Aucun modèle de chat xAI n'accepte la vidéo, et Grok ne lit que des images JPEG ou PNG de 20 Mo au plus. Gemini lit nativement photos, vidéos et son, et son filtre de contenu sexuel peut être désactivé ; Charles l'a choisi pour la Vision le 17/10 à 18h20. Le comparatif sourcé est hors dépôt (`modeles-ia/comparatif-modeles.md`).

## Décision

- Le rôle `sense` de la passerelle (ADR 0009) utilise **Gemini 3.8 Flash**, par une clé AI Studio (`LLM_GOOGLE_API_KEY`, ou saisie dans le CRM selon l'ADR 0016), avec les seuils de sécurité désactivés. Gemini 4 Argon reste configurable pour comparer les deux sur le catalogue.
- Une vidéo de 20 Mo au plus part telle quelle ; au-delà, elle est découpée en images clés tant que l'API Files n'est pas branchée.
- **Bascule automatique sur Grok 4.7** quand Gemini refuse ou bloque, y compris un blocage silencieux (fin « other » sans texte) : la vidéo est découpée par ffmpeg en 24 images clés datées au plus, et son son est transcrit (xAI, 0,10 $ par heure). Les images clés ne sont calculées qu'au moment de cette bascule.
- Un second repli, **Qwen3-VL**, viendra plus tard.
- Chaque refus est journalisé (`refused` dans le journal des appels) : le **taux de refus** de Gemini se mesure, il ne se suppose pas.
- La description suit le vocabulaire fermé `MediaDescription` (`packages/contracts`). Elle est mise en cache par fichier, origine, version du vocabulaire, modèle et prompt. Une description faite par le repli n'est pas gardée.
- Le texte lu dans un média et ce qui y est dit sont des données (`wrapUntrusted`), soumis à la même détection de pièges que le message du fan. Un drapeau de sécurité (mineur possible, non-consentement…) passe la main à un humain.
- Les médias des fans ne sont pas conservés après leur description. Ceux des bundles sont décrits une fois à l'import, puis relus par Charles ou Messa.

## Conséquences

- Les médias des fans transitent par Google, qui conserve les requêtes payantes un temps limité : c'est à inscrire au registre RGPD.
- La production a besoin de ffmpeg (image Docker), et la CI l'installe pour ses tests.
- Deux clés (Google et xAI) sont nécessaires pour que la bascule serve à quelque chose. Sans clé Google, Grok décrit seul, à partir des images clés.
- Un refus coûte un appel de plus, mesuré dans le journal.

## Alternatives rejetées

- **Grok seul** : il ne lit ni la vidéo ni le son, et le découpage systématique perd le mouvement et coûte plus en images.
- **Un modèle open-weights hébergé par nous** : il faudrait un GPU à maintenir pour un volume faible. C'est le rôle de Qwen3-VL, en repli par un fournisseur.
