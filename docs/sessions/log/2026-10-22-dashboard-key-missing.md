# 2026-10-22 — Dashboard : clé manquante, tâches bloquées, brouillons vers Suivi — done

Fait : quand l'IA qui écrit n'a aucune clé (`voice.keyMissing`, PR santé), le héros dit en ambre « L'IA qui écrit **attend sa clé** », indique où la poser (Réglages › Modèles IA › Services) et propose « Poser la clé », qui mène à Réglages › Modèles IA. La tuile dit « Clé manquante » en ambre au lieu de « Ne répond plus » en rouge. Si Reveal n'est pas relié non plus, Reveal parle en premier et le héros ajoute « L'IA qui écrit attend aussi sa clé. ». Le titre de la pastille dit « l'IA qui écrit attend sa clé ». Les tâches abandonnées par le serveur (`jobs.dead`) apparaissent dans la tuile « Délai de réponse habituel » (« 3, à regarder ») et dans le résumé du pli, en ambre. Quand le serveur n'a pas pu les compter, la tuile dit « pas lu » sans couleur. Une ligne « À valider dans Suivi » ouvre Suivi sur sa conversation (`/suivi?conversation=…`) au lieu du lecteur du Dashboard.
Pas fait : la part agent des Meilleurs fans sur `--nv-data-1` (A-11). Le jeton arrive avec la refonte du design system (#105), on le branchera une fois celle-ci fusionnée.
Décisions : aucune.
Découvertes : le lecteur du Dashboard dit encore « en attendant le lecteur de Suivi », alors que ce lecteur existe depuis #109. Les autres lignes de « À traiter » pourraient aussi ouvrir Suivi : c'est à décider avec Extension.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓.
