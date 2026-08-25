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

**Équipes** — radar de profil sur 8 axes, puis comparatif détaillé sur une
quarantaine de mesures groupées (ballon, création, finition, pressing et défense,
discipline), et le réseau de passes de chaque équipe.

**Joueurs** — tableau triable, filtre par équipe, trois jeux de colonnes
(général / offensif / défensif), bascule total ↔ par 90 minutes.

**Duel** — deux joueurs face à face, radar mis à l'échelle du meilleur des 22 et
tableau des écarts.

---

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
