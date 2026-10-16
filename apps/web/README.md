# apps/web

Le dashboard de supervision (Vite, React 19, TanStack Router + Query, Tailwind v4, shadcn/ui), installable en PWA (phase 5, Web Push).

Écrans par phase : connexion (P0) · liste des conversations (P0, brute) · inbox copilote clavier (P4 : approuver `a`, éditer `e`, rejeter `r`, suivant `j`/`k`) · conversation avec journal et traces (P4) · fiche fan et faits (P4) · supervision : interrupteurs, sessions, métriques (P4) · persona (P5) · catalogue et offres (P6).

Règles : les types viennent de `@nirvana/contracts` ; aucun appel direct à la base ; l'état serveur passe par TanStack Query ; temps réel par SSE (`/events`). Le design est à créer avant la phase 4 : identité « Liquid Glass » (iOS 26/27), brief dans `docs/design/brief.md`, fiche D-01 ; tokens dans `src/styles/tokens.css`.
