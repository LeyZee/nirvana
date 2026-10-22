# 2026-10-22 · CI : l'installation de ffmpeg ne gèle plus le job Tests

Fait : l'étape « Install ffmpeg » du job Tests a une limite de 10 minutes ; chaque `apt-get` est borné (60 s pour `update`, 120 s pour `install`), trois essais, et le déclencheur man-db (lent sur les runners) est coupé. Si le runner a déjà ffmpeg et ffprobe, l'étape ne fait rien.

Pas fait : rien.

Décisions : garder apt-get plutôt qu'une action tierce de ffmpeg : pas de nouvelle dépendance de CI à épingler, et la même version que les tests ont toujours vue.

Relectures : agent (module media, qui lance ffmpeg dans ses tests).

Découvertes : avant ce correctif, le job Tests a gelé deux fois 20 minutes sur `apt-get` (#105), avant tout test.

Candidats à suppression : aucun.

Vérifié : `pnpm check` ; YAML relu (Prettier, `yaml.safe_load`) ; la CI de cette PR passe par l'étape.
