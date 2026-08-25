# Feuille de Match

Outil d'analyse de match : on dépose un fichier, il sort un rapport complet —
comparatif des deux équipes, puis de chaque joueur.

Tout tourne dans le navigateur. Aucun fichier n'est envoyé nulle part, aucun
serveur n'est nécessaire, la page fonctionne hors ligne.

**En ligne : <https://haris692.github.io/kazma-tool-analytics/>**

---

## Utilisation

En ligne : <https://haris692.github.io/kazma-tool-analytics/>

Hors ligne : ouvrir `dist/rapport-match.html` dans un navigateur
(double-clic suffit), ou enregistrer la page en ligne avec `Ctrl+S` —
c'est un fichier unique, il n'a besoin de rien d'autre.
La page s'ouvre sur un match de démonstration — France 4-2 Croatie, finale de la
Coupe du Monde 2018 — pour montrer le rendu sans rien avoir à importer.

Onglet **Données** pour charger son propre match : glisser-déposer, ou bouton.

`Ctrl+P` exporte le rapport en PDF.

## Formats acceptés

| Format | Contenu attendu | Ce qu'on en tire |
|---|---|---|
| `.json` | Événements StatsBomb (une ligne par action du match) | Le rapport complet : équipes, joueurs, xG, carte des tirs, pressing, réseau de passes |
| `.json` | Composition StatsBomb (optionnel, à déposer en même temps) | Numéros de maillot et temps de jeu exact |
| `.xml` | Codage vidéo — balises `<instance>` (SportsCode, Nacsport, LongoMatch) | Décompte des actions codées, par code et par étiquette |
| `.csv` | Un tableau, une ligne par joueur ou par équipe | Comparaison de deux lignes : radar + écarts, colonnes numériques détectées seules |

Un XML de codage vidéo ne contient **que ce que l'analyste a codé** : il n'y a ni
xG ni coordonnées dedans. Le rapport s'adapte à ce que le fichier contient.

## Ce que contient le rapport

**Résumé** — score, dispositifs, tuiles clés, course aux xG minute par minute,
carte des tirs, chronologie des buts.

**Équipes** — radar de profil sur 8 axes, puis comparatif détaillé sur 38 mesures
groupées (ballon, création, finition, pressing et défense, discipline), chacune
avec son écart lu depuis le point de vue choisi, et le réseau de passes de chaque
équipe.

**Joueurs** — tableau triable, filtre par équipe, trois jeux de colonnes
(général / offensif / défensif), bascule total ↔ par 90 minutes.

**Duel** — deux joueurs face à face, radar mis à l'échelle du meilleur des 22 et
tableau des écarts.

---

## Le code couleur

Le rapport n'a que **deux canaux de couleur**, et chacun ne fait qu'une chose.

**Identité — qui.** Bleu pour l'équipe A, orange pour l'équipe B. Ces deux
teintes ne veulent jamais dire « bien » ou « mal ». Elles portent les barres, les
courbes, les points de la carte des tirs, les pastilles.

**Valence — mieux ou moins bien.** Vert et rouge, réservés à la colonne d'écart
et au pied des tuiles. Ils se lisent depuis le **point de vue** choisi en haut du
rapport : une équipe, ou « Neutre ». Sans point de vue, « mieux » n'a pas de sens
dans un match à deux, et le rapport se contente d'afficher les écarts bruts.

La valence ne prend **jamais** la forme d'un aplat, et la flèche ▲ / ▼ porte le
sens avant la couleur. Deux mesures l'imposent (distance OKLab ×100, plancher
d'usage 15) :

| Paire | Écart mesuré | Conséquence |
|---|---|---|
| rouge déficit ↔ orange équipe B | 10,8 en clair · 7,1 en sombre | côte à côte en aplat, on les confond |
| vert ↔ rouge | **4,1 en deutéranopie** | pour un daltonien rouge-vert, une seule et même couleur |

Le second chiffre est le vrai sujet : environ un homme sur douze ne distingue pas
le vert du rouge. C'est pourquoi le signe fait le travail et la couleur ne fait
que le renforcer — le rapport se lit juste en noir et blanc, à l'impression, et
sans voir la couleur.

## Ce que le rapport refuse de juger

Sur les 38 mesures du comparatif, **14 n'ont pas de bon sens** et s'affichent en
gris, marquées « sans jugement ». Ce n'est pas de la prudence, c'est le fond du
métier :

- **Dégager beaucoup**, c'est subir, pas bien défendre.
- **Beaucoup d'arrêts** veut dire que le gardien est bombardé.
- **Centrer beaucoup** est souvent l'aveu qu'on n'entre pas dans la surface
  autrement.
- **La possession** sert une équipe de position et dessert une équipe de contre.
- **Le volume de pressings** dépend d'abord du temps passé sans le ballon.

18 mesures sont orientées vers le haut, 6 vers le bas (PPDA, ballons perdus,
fautes, cartons, hors-jeu). `test/dir.js` refuse toute mesure non classée : sans
ce contrôle, une mesure ajoutée serait jugée « haut = mieux » par défaut, et le
rapport dirait à un staff que subir, c'est bien faire.

Le duel individuel, lui, ne juge rien : comparer un avant-centre à un défenseur
central sur les mêmes axes n'aurait pas de sens, donc l'écart y reste aux
couleurs d'équipe.

## Choix de calcul

Les définitions ne sont pas neutres. Celles retenues ici :

**Possession** — part du temps de jeu réel, calculée en additionnant la durée de
chaque séquence de possession. Ce n'est pas une part du nombre de passes, qui
surestime les équipes qui font circuler court.

**Passe / conduite progressive** — action réussie qui rapproche le ballon d'au
moins 10 m du but adverse, **hors** actions parties des 40 % défensifs
(définition FBref). Sans cette exclusion, les dégagements du gardien trustent le
classement : ils partent de 115 m du but, donc tout gain y est mécaniquement
énorme, tandis qu'un attaquant déjà à 25 m ne peut jamais l'atteindre.

**PPDA** — passes adverses concédées dans les 60 % de terrain adverse, divisées
par le nombre d'actions défensives (tacles, interceptions, fautes) de l'équipe
dans cette zone. Plus c'est bas, plus le pressing est intense.

**Field tilt** — part des passes dans le dernier tiers par rapport au total des
deux équipes. Dit qui campe dans le camp adverse, indépendamment du volume.

**xA** — pour chaque tir, le xG est crédité à l'auteur de la passe qui l'a
provoqué. Ce n'est pas un modèle de passe, c'est une attribution.

**Tirs au but** — la période 5 est exclue de toutes les statistiques.

## Pièges StatsBomb intégrés

Trois détails du format qui faussent silencieusement les chiffres si on les
ignore, et que le moteur traite :

1. **Une passe réussie n'a pas de champ `outcome`.** Seuls les échecs sont
   étiquetés. Compter `outcome === 'Complete'` donne zéro passe réussie.
2. **La clé JSON du gardien est `goalkeeper`** en un mot, alors que le type
   d'événement s'appelle `Goal Keeper`. Se tromper donne zéro arrêt.
3. **Les duels aériens gagnés ne sont pas des événements `Duel`.** StatsBomb ne
   crée un `Duel` que pour le perdant (`Aerial Lost`) et pose un drapeau
   `aerial_won` sur l'action du gagnant. Ne lire que les `Duel` donne zéro duel
   aérien gagné.

---

## Développement

```
src/engine.js            moteur de calcul, sans dépendance, tourne aussi dans node
src/app.js               interface
src/styles.css           thèmes clair et sombre
src/index.template.html  gabarit
build.py                 assemble le tout dans dist/rapport-match.html
build_demo.py            allège le match de démo embarqué
data/                    match de démo (StatsBomb open data, match 8658)
test/                    vérifications
```

Assembler la page :

```
python build.py             # avec la démo embarquée
python build.py --no-demo   # page vide, ~90 Ko
```

Vérifier le moteur :

```
node test/run.js    # 25 contrôles sur France-Croatie 2018
node test/slim.js   # la démo allégée donne les mêmes chiffres que le fichier brut
node test/dir.js    # chaque mesure déclare si le haut, le bas, ou rien n'est mieux
```

`test/run.js` ne se contente pas de vérifier que le code s'exécute : il ferme des
identités qui ne peuvent pas être vraies par hasard — *tirs cadrés d'une équipe =
ses buts + les arrêts du gardien adverse*, *duels aériens gagnés par un camp =
perdus par l'autre*, *somme des xG des joueurs = xG de l'équipe*. Si une
définition dérive, un de ces contrôles casse.

Après toute modification de `build_demo.py` ou du moteur, relancer `test/slim.js` :
il compare la démo embarquée au fichier StatsBomb d'origine champ par champ, pour
que l'outil ne mente pas sur son propre exemple.

## Données de démonstration

StatsBomb Open Data, match 8658 (France-Croatie, 15 juillet 2018), sous licence
StatsBomb. Le fichier embarqué est une projection sur les seuls champs lus par le
moteur : 2,5 Mo → 849 Ko, à chiffres identiques.
