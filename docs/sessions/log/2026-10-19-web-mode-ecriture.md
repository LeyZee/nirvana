# 2026-10-19 — Le contrôle du Dashboard change vraiment le mode — done
Fait : le contrôle du mode écrit `PUT /v1/agent/mode` (#83). Arrêt (après confirmation) et Copilote, aussi par « Repasser en copilote », partent au serveur ; l'écran ne montre un mode qu'une fois le serveur l'ayant pris, puis relit le Dashboard. Une lecture encore en vol au moment du clic est abandonnée, pour qu'une réponse plus ancienne ne remette pas l'ancien mode (test qui échoue sans). Automatique reste grisé tant que `automatic.open` est faux ; un 409 affiche la phrase du serveur. Pendant l'envoi, « Envoi au serveur… » sous le contrôle. Un refus ou une panne dit « Le mode n'a pas changé » sans rien changer, jusqu'à la prochaine réponse du serveur (relecture du fil Dashboard). `globalStop` (#86) est lu dès le chargement : l'écran dit qu'un arrêt général retient l'agent, grise Copilote et Automatique et retire « Repasser en copilote » ; la réponse du PUT le dit aussi après un clic.
Pas fait : rien.
Décisions : pas d'affichage anticipé du mode avant la réponse du serveur, même pour Arrêt (la route répond sans ré-authentification) ; l'exemple d'avant la première créatrice garde un contrôle qui ne pilote rien.
Découvertes : aucune.
Candidats à suppression : aucun.
Vérifié : pnpm check ✓, pnpm test ✓ (web).
