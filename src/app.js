/* ==========================================================================
   Rapport de match - interface
   ========================================================================== */
(function () {
  'use strict';

  var KMR = window.KMR;
  var S = {
    data: null,
    tab: 'resume',
    sortKey: 'minutes',
    sortDir: -1,
    teamFilter: 'all',
    playerView: 'general',
    duelA: null,
    duelB: null,
    per90: false,
    netTeam: null,
    pov: null,
    povTouched: false,
    theme: null,
    pending: { events: null, lineups: null }
  };

  /* ------------------------------------------------------------ formatage
     f()  : affichage humain, virgule decimale francaise.
     nf() : geometrie SVG et largeurs CSS, point decimal obligatoire.
     Ne jamais utiliser f() dans un attribut SVG : "x=123,4" est invalide et
     l'element part silencieusement a l'origine.                              */
  function f(v, d) {
    if (v == null || (typeof v === 'number' && !isFinite(v))) return '--';
    var s = Number(v).toFixed(d == null ? 0 : d);
    return d ? s.replace('.', ',') : s;
  }
  function nf(v, d) {
    if (v == null || !isFinite(v)) return '0';
    return Number(v).toFixed(d == null ? 1 : d);
  }
  function pct(v, d) { return f(v, d == null ? 1 : d) + ' %'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  // StatsBomb code les dispositifs en chiffres colles : 442 -> 4-4-2.
  function formation(v) {
    if (!v) return '';
    return String(v).split('').join('-');
  }
  // L'ecart : pastille coloree pour dire qui mene, chiffre en encre pour rester
  // lisible. Un chiffre teinte a la couleur de l'equipe passerait sous le seuil
  // de contraste a cette taille.
  function gap(diff, d) {
    if (Math.abs(diff) < 1e-9) return '<span style="color:var(--ink-3)">0</span>';
    return '<span class="gapv"><span class="chip ' + (diff > 0 ? 'a' : 'b') + '"></span>' +
      (diff > 0 ? '+' : '') + f(diff, d) + '</span>';
  }

  /* ----------------------------------------------------- rendu de l'ecart
     Trois lectures, selon le point de vue et la mesure :
       - pas de point de vue    -> pastille de l'equipe devant + ecart, en gris
       - mesure neutre (dir 0)  -> idem : le rapport ne juge pas
       - mesure orientee        -> fleche avantage/deficit + ecart en valeur
                                   absolue, teinte vert ou rouge

     La fleche est l'encodage principal, la couleur seulement un renfort :
     vert et rouge sont a DE 4,1 l'un de l'autre en deuteranopie. Le signe
     porte le sens, et un titre au survol le redit en toutes lettres.        */
  function delta(mine, theirs, dir, d, povSet, chipSide) {
    var diff = mine - theirs;
    if (Math.abs(diff) < 1e-9) return '<span class="delta flat" title="a egalite">=</span>';

    if (!povSet || !dir) {
      // Sans point de vue la pastille dit qui mene ; sur une mesure neutre
      // elle dit seulement qui en a fait plus, et le titre le precise.
      return '<span class="delta mute" title="' +
        (dir ? 'meilleur sur cette mesure' : 'ecart brut : mesure de volume ou de contexte, sans jugement') +
        '"><span class="chip ' + chipSide + '"></span>' + f(Math.abs(diff), d) + '</span>';
    }
    var better = dir > 0 ? diff > 0 : diff < 0;
    return '<span class="delta ' + (better ? 'up' : 'down') + '" title="' +
      (better ? 'avantage' : 'deficit') + ' de ' + f(Math.abs(diff), d) + '">' +
      '<span class="arw" aria-hidden="true">' + (better ? '▲' : '▼') + '</span>' +
      f(Math.abs(diff), d) + '</span>';
  }

  // La pastille de l'ecart designe le meilleur quand la mesure a un sens,
  // et sinon simplement celui qui en a fait le plus.
  function chipFor(na, nb, dir) {
    if (dir) return (dir > 0 ? na > nb : na < nb) ? 'a' : 'b';
    return na > nb ? 'a' : 'b';
  }

  function shortName(n) {
    if (!n) return '?';
    var parts = String(n).split(' ');
    if (parts.length === 1) return parts[0];
    return parts[0].charAt(0) + '. ' + parts.slice(1).join(' ');
  }

  /* ------------------------------------------------- definition des mesures
     dir : direction du merite, le coeur de la lecture du rapport.
        1  la valeur haute est la meilleure
       -1  la valeur basse est la meilleure (PPDA, ballons perdus, fautes)
        0  aucune des deux - la mesure est un volume ou un contexte

     Le zero n'est pas de la prudence, c'est le fond du metier : beaucoup de
     degagements ou beaucoup d'arrets ne veulent pas dire bien defendre, ils
     veulent dire subir. Beaucoup de centres est souvent l'aveu qu'on n'entre
     pas dans la surface. La possession sert un jeu de position et dessert une
     equipe de contre. Trancher a la place de l'analyste sur ces mesures-la
     serait faux ; le rapport les affiche en gris et ne juge pas.            */
  var GROUPS = [
    {
      title: 'Ballon',
      rows: [
        { k: 'possession', label: 'Possession', d: 1, suffix: ' %', dir: 0, tip: 'Part du temps de jeu reel. Volontairement sans jugement : elle sert une equipe de position et dessert une equipe de contre.' },
        { k: 'passes', label: 'Passes tentées', dir: 0 },
        { k: 'passAcc', label: 'Précision des passes', d: 1, suffix: ' %', dir: 1 },
        { k: 'progressivePasses', label: 'Passes progressives', dir: 1, tip: 'Passe réussie qui rapproche le ballon d’au moins 10 m du but adverse. Les relances parties des 40 % défensifs sont exclues, sinon les dégagements du gardien dominent le classement.' },
        { k: 'longPasses', label: 'Passes longues (> 32 m)', dir: 0 },
        { k: 'carries', label: 'Conduites de balle', dir: 0 },
        { k: 'progressiveCarries', label: 'Conduites progressives', dir: 1, tip: 'Même règle que les passes progressives, balle au pied.' }
      ]
    },
    {
      title: 'Création',
      rows: [
        { k: 'fieldTilt', label: 'Field tilt', d: 1, suffix: ' %', dir: 1, tip: 'Part des passes dans le dernier tiers. Mesure qui campe dans le camp adverse.' },
        { k: 'finalThirdPasses', label: 'Passes dans le dernier tiers', dir: 1 },
        { k: 'passesIntoBox', label: 'Passes dans la surface', dir: 1 },
        { k: 'touchesInBox', label: 'Touches dans la surface', dir: 1 },
        { k: 'crosses', label: 'Centres', dir: 0, tip: 'Volume sans jugement : centrer beaucoup est souvent le signe qu’on n’entre pas dans la surface autrement.' },
        { k: 'keyPasses', label: 'Passes menant à un tir', dir: 1 },
        { k: 'xa', label: 'xA', d: 2, dir: 1, tip: 'Somme des xG des tirs issus des passes de l’équipe.' },
        { k: 'dribblesCompleted', label: 'Dribbles réussis', dir: 1 }
      ]
    },
    {
      title: 'Finition',
      rows: [
        { k: 'shots', label: 'Tirs', dir: 1 },
        { k: 'shotsOnTarget', label: 'Tirs cadrés', dir: 1 },
        { k: 'shotsInBox', label: 'Tirs dans la surface', dir: 1 },
        { k: 'xg', label: 'xG', d: 2, dir: 1, tip: 'Buts attendus : somme de la probabilité de marquer de chaque tir.' },
        { k: 'goals', label: 'Buts', dir: 1 },
        { k: 'xgPerShot', label: 'xG par tir', d: 2, dir: 1, tip: 'Qualité moyenne des occasions.' }
      ]
    },
    {
      title: 'Pressing et défense',
      rows: [
        { k: 'ppda', label: 'PPDA', d: 1, dir: -1, tip: 'Passes adverses concédées par action défensive. Plus c’est bas, plus le pressing est intense.' },
        { k: 'pressures', label: 'Pressings', dir: 0, tip: 'Volume : il depend d’abord du temps passé sans le ballon.' },
        { k: 'counterpressures', label: 'Contre-pressings', dir: 0, tip: 'Pressing dans les 5 secondes suivant une perte de balle. Volume : il faut avoir perdu le ballon pour en faire.' },
        { k: 'recoveries', label: 'Ballons récupérés', dir: 0 },
        { k: 'interceptions', label: 'Interceptions', dir: 0 },
        { k: 'tackles', label: 'Tacles', dir: 0 },
        { k: 'duelsWon', label: 'Duels gagnés', dir: 1 },
        { k: 'aerialsWon', label: 'Duels aériens gagnés', dir: 1 },
        { k: 'clearances', label: 'Dégagements', dir: 0, tip: 'Sans jugement : dégager beaucoup, c’est subir, pas bien défendre.' },
        { k: 'blocks', label: 'Tirs contrés', dir: 0 },
        { k: 'saves', label: 'Arrêts du gardien', dir: 0, tip: 'Sans jugement : beaucoup d’arrêts veut dire que le gardien est bombardé.' }
      ]
    },
    {
      title: 'Discipline et déchet',
      rows: [
        { k: 'turnovers', label: 'Ballons perdus', dir: -1 },
        { k: 'foulsCommitted', label: 'Fautes commises', dir: -1 },
        { k: 'yellowCards', label: 'Cartons jaunes', dir: -1 },
        { k: 'redCards', label: 'Cartons rouges', dir: -1 },
        { k: 'offsides', label: 'Hors-jeu', dir: -1 },
        { k: 'corners', label: 'Corners', dir: 0 }
      ]
    }
  ];

  function teamVal(t, k) {
    if (k === 'xgPerShot') return t.shots ? t.xg / t.shots : 0;
    return t[k];
  }

  /* colonnes du tableau joueurs, par vue */
  var COLS = {
    general: [
      ['minutes', 'Min', 0], ['touches', 'Tou', 0], ['passes', 'Pas', 0], ['passAcc', '%', 0],
      ['progressivePasses', 'Prog', 0], ['keyPasses', 'Clés', 0], ['xa', 'xA', 2],
      ['shots', 'Tirs', 0], ['goals', 'Buts', 0], ['xg', 'xG', 2],
      ['duelsWon', 'Duels+', 0], ['pressures', 'Press', 0], ['recoveries', 'Réc', 0], ['turnovers', 'Perdus', 0]
    ],
    offensif: [
      ['minutes', 'Min', 0], ['touchesInBox', 'Tou. surf.', 0],
      ['shots', 'Tirs', 0], ['shotsOnTarget', 'Cadrés', 0], ['goals', 'Buts', 0], ['xg', 'xG', 2],
      ['keyPasses', 'Clés', 0], ['assists', 'Passes D', 0], ['xa', 'xA', 2],
      ['finalThirdPasses', 'Dern. tiers', 0], ['passesIntoBox', 'Dans surf.', 0], ['crosses', 'Centres', 0],
      ['dribblesCompleted', 'Drib+', 0], ['progressiveCarries', 'Cond. prog', 0]
    ],
    defensif: [
      ['minutes', 'Min', 0], ['pressures', 'Press', 0], ['duels', 'Duels', 0], ['duelsWon', 'Duels+', 0],
      ['aerialsWon', 'Aér+', 0], ['aerialsLost', 'Aér-', 0], ['tackles', 'Tacles', 0],
      ['interceptions', 'Int', 0], ['recoveries', 'Réc', 0], ['clearances', 'Dég', 0],
      ['blocks', 'Contres', 0], ['foulsCommitted', 'Fautes', 0], ['saves', 'Arrêts', 0]
    ]
  };

  var PER90_EXEMPT = { minutes: 1, passAcc: 1 };

  function pv(p, k) {
    var v = p[k];
    if (v == null) return null;
    if (S.per90 && !PER90_EXEMPT[k] && p.minutes > 0) return v / p.minutes * 90;
    return v;
  }

  /* ====================================================== briques SVG */

  /* Terrain 120 x 80, oriente en longueur. */
  function pitchMarkup(pad) {
    pad = pad || 0;
    function r(x, y, w, h) {
      return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" class="pitch-line"/>';
    }
    return '' +
      '<rect x="' + (-pad) + '" y="' + (-pad) + '" width="' + (120 + pad * 2) + '" height="' + (80 + pad * 2) + '" class="pitch-bg" rx="1"/>' +
      r(0, 0, 120, 80) +
      '<line x1="60" y1="0" x2="60" y2="80" class="pitch-line"/>' +
      '<circle cx="60" cy="40" r="10" class="pitch-line"/>' +
      '<circle cx="60" cy="40" r="0.8" class="pitch-line" fill="currentColor"/>' +
      r(0, 18, 18, 44) + r(102, 18, 18, 44) +
      r(0, 30, 6, 20) + r(114, 30, 6, 20) +
      '<circle cx="12" cy="40" r="0.8" class="pitch-line"/>' +
      '<circle cx="108" cy="40" r="0.8" class="pitch-line"/>' +
      '<path d="M18 32 A 10 10 0 0 1 18 48" class="pitch-line"/>' +
      '<path d="M102 32 A 10 10 0 0 0 102 48" class="pitch-line"/>';
  }

  /* Carte des tirs : l'equipe A attaque a droite, l'equipe B est miroir. */
  function shotMap(d) {
    var A = d.teamNames[0], B = d.teamNames[1];
    var marks = '';
    var shots = d.shots.filter(function (s) { return s.x != null; });
    // les plus gros dessous, pour que les petites occasions restent visibles
    shots.sort(function (p, q) { return q.xg - p.xg; });
    shots.forEach(function (s) {
      var x = s.team === A ? s.x : 120 - s.x;
      var y = s.team === A ? s.y : 80 - s.y;
      // Rayon en unites de terrain : un but attendu certain (xG 1) fait 3,6 m
      // de rayon, soit un disque lisible sans ecraser ses voisins.
      var rr = 0.8 + Math.sqrt(Math.max(s.xg, 0.004)) * 2.8;
      var cls = s.team === A ? 'mark-a' : 'mark-b';
      var tip = esc(shortName(s.player)) + ' — ' + s.minute + "' · xG " + f(s.xg, 2) +
        ' · ' + esc(outcomeFr(s.outcome));
      marks += '<circle cx="' + nf(x, 2) + '" cy="' + nf(y, 2) + '" r="' + nf(rr, 2) + '" class="' + cls + '" ' +
        (s.goal
          ? 'opacity="1" stroke="var(--ink)" stroke-width="0.55"'
          : 'opacity="0.45" stroke="var(--pitch-fill)" stroke-width="0.3"') +
        ' data-tip="' + tip + '"/>';
    });
    return '<div class="figure pitchfig"><svg viewBox="-2 -3 124 86" role="img" aria-label="Carte des tirs">' +
      pitchMarkup(0) +
      '<text x="1" y="-0.6" class="pitch-side">' + esc(A) + ' →</text>' +
      '<text x="119" y="-0.6" class="pitch-side" text-anchor="end">← ' + esc(B) + '</text>' +
      marks + '</svg></div>';
  }

  function outcomeFr(o) {
    var m = {
      'Goal': 'but', 'Saved': 'arrêté', 'Blocked': 'contré', 'Off T': 'non cadré',
      'Wayward': 'très écarté', 'Post': 'poteau', 'Saved Off Target': 'arrêté, non cadré',
      'Saved to Post': 'arrêté sur le poteau', 'Own Goal': 'csc'
    };
    return m[o] || (o || '');
  }

  /* Courbe des xG cumules, en escalier (un tir fait sauter la valeur). */
  function xgRace(d) {
    var W = 700, H = 240, mL = 34, mR = 46, mT = 14, mB = 26;
    var maxMin = Math.max(d.match.minutes, 90);
    var maxXg = Math.max(d.teams[d.teamNames[0]].xg, d.teams[d.teamNames[1]].xg, 0.5) * 1.12;
    function X(m) { return mL + m / maxMin * (W - mL - mR); }
    function Y(v) { return H - mB - v / maxXg * (H - mT - mB); }

    function step(key) {
      var p = 'M ' + nf(X(0)) + ' ' + nf(Y(0));
      var last = 0;
      d.xgRace.forEach(function (pt) {
        p += ' L ' + nf(X(pt.minute)) + ' ' + nf(Y(last));
        p += ' L ' + nf(X(pt.minute)) + ' ' + nf(Y(pt[key]));
        last = pt[key];
      });
      p += ' L ' + nf(X(maxMin)) + ' ' + nf(Y(last));
      return p;
    }

    var grid = '', i;
    var stepY = maxXg > 3 ? 1 : (maxXg > 1.4 ? 0.5 : 0.25);
    for (i = 0; i <= maxXg; i += stepY) {
      grid += '<line x1="' + mL + '" y1="' + nf(Y(i)) + '" x2="' + (W - mR) + '" y2="' + nf(Y(i)) + '" class="grid-line"/>' +
        '<text x="' + (mL - 6) + '" y="' + nf(Y(i) + 3) + '" class="tick" text-anchor="end">' + f(i, 2) + '</text>';
    }
    var xt = '';
    for (i = 0; i <= maxMin; i += 15) {
      xt += '<text x="' + nf(X(i)) + '" y="' + (H - mB + 14) + '" class="tick" text-anchor="middle">' + i + "'</text>";
    }
    if (d.match.minutes > 46) {
      xt += '<line x1="' + nf(X(45)) + '" y1="' + mT + '" x2="' + nf(X(45)) + '" y2="' + (H - mB) + '" class="axis-line"/>' +
        '<text x="' + nf(X(45) + 4) + '" y="' + (mT + 9) + '" class="tick">mi-temps</text>';
    }

    var goals = '';
    d.xgRace.forEach(function (pt) {
      if (!pt.shot || !pt.shot.goal) return;
      var isA = pt.shot.team === d.teamNames[0];
      goals += '<circle cx="' + nf(X(pt.minute)) + '" cy="' + nf(Y(isA ? pt.a : pt.b)) + '" r="4.5" class="' +
        (isA ? 'mark-a' : 'mark-b') + ' dot-ring" data-tip="' +
        esc(shortName(pt.shot.player)) + ' — but ' + pt.shot.minute + "' · xG " + f(pt.shot.xg, 2) + '"/>';
    });

    var ta = d.teams[d.teamNames[0]], tb = d.teams[d.teamNames[1]];
    // Les deux etiquettes de fin se chevauchent quand les totaux sont proches.
    var ya = Y(ta.xg), yb = Y(tb.xg);
    if (Math.abs(ya - yb) < 12) { var mid = (ya + yb) / 2; ya = mid - 6; yb = mid + 6; }
    var labels =
      '<text x="' + (W - mR + 6) + '" y="' + nf(ya + 3) + '" class="direct-label a">' + f(ta.xg, 2) + '</text>' +
      '<text x="' + (W - mR + 6) + '" y="' + nf(yb + 3) + '" class="direct-label b">' + f(tb.xg, 2) + '</text>';

    return '<div class="figure"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Courbe des xG cumulés">' +
      grid + xt +
      '<line x1="' + mL + '" y1="' + (H - mB) + '" x2="' + (W - mR) + '" y2="' + (H - mB) + '" class="axis-line"/>' +
      '<path d="' + step('a') + '" class="line-a"/>' +
      '<path d="' + step('b') + '" class="line-b"/>' +
      goals + labels +
      '<text x="' + mL + '" y="' + (mT - 2) + '" class="axis-title">xG cumulés</text>' +
      '</svg></div>';
  }

  /* Radar. axes = [{label, a, b, max}] deja normalises par l'appelant. */
  function radar(axes, nameA, nameB) {
    // Le viewBox reserve une marge laterale pour les etiquettes d'axes :
    // sans elle, "Récupérations" deborde de la carte qui contient le radar.
    var R = 100, W = 420, H = 330, CX = 210, CY = 162;
    var n = axes.length;
    function pt(i, frac) {
      var ang = -Math.PI / 2 + i / n * Math.PI * 2;
      return [CX + Math.cos(ang) * R * frac, CY + Math.sin(ang) * R * frac];
    }
    var C = CX;
    var web = '', k, i;
    for (k = 1; k <= 4; k++) {
      var ring = [];
      for (i = 0; i < n; i++) ring.push(pt(i, k / 4).map(function (v) { return nf(v); }).join(','));
      web += '<polygon points="' + ring.join(' ') + '" class="radar-web"/>';
    }
    var spokes = '', labels = '';
    for (i = 0; i < n; i++) {
      var e = pt(i, 1);
      spokes += '<line x1="' + CX + '" y1="' + CY + '" x2="' + nf(e[0]) + '" y2="' + nf(e[1]) + '" class="radar-axis"/>';
      var lp = pt(i, 1.14);
      var anchor = Math.abs(lp[0] - C) < 6 ? 'middle' : (lp[0] > C ? 'start' : 'end');
      labels += '<text x="' + nf(lp[0]) + '" y="' + nf(lp[1] + 3) + '" class="radar-label" text-anchor="' + anchor + '">' +
        esc(axes[i].label) + '</text>';
    }
    function poly(key, cls) {
      var pts = [];
      for (var j = 0; j < n; j++) {
        var frac = axes[j].max > 0 ? Math.max(0, axes[j][key]) / axes[j].max : 0;
        pts.push(pt(j, Math.min(frac, 1)).map(function (v) { return nf(v); }).join(','));
      }
      return '<polygon points="' + pts.join(' ') + '" class="' + cls + '"/>';
    }
    var dots = '';
    for (i = 0; i < n; i++) {
      ['a', 'b'].forEach(function (key) {
        var frac = axes[i].max > 0 ? Math.min(Math.max(0, axes[i][key]) / axes[i].max, 1) : 0;
        var p = pt(i, frac);
        dots += '<circle cx="' + nf(p[0]) + '" cy="' + nf(p[1]) + '" r="3.2" class="' +
          (key === 'a' ? 'mark-a' : 'mark-b') + ' dot-ring" data-tip="' +
          esc(axes[i].label) + ' — ' + esc(key === 'a' ? nameA : nameB) + ' : ' +
          f(axes[i][key + 'raw'], axes[i].d || 0) + '"/>';
      });
    }
    return '<div class="figure"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Radar comparatif">' +
      web + spokes +
      poly('a', 'area-a') + poly('b', 'area-b') +
      '<polygon points="' + polyPts(axes, 'a', pt, n) + '" class="line-a" fill="none"/>' +
      '<polygon points="' + polyPts(axes, 'b', pt, n) + '" class="line-b" fill="none"/>' +
      dots + labels + '</svg></div>';
  }
  function polyPts(axes, key, pt, n) {
    var pts = [];
    for (var j = 0; j < n; j++) {
      var frac = axes[j].max > 0 ? Math.min(Math.max(0, axes[j][key]) / axes[j].max, 1) : 0;
      pts.push(pt(j, frac).map(function (v) { return nf(v); }).join(','));
    }
    return pts.join(' ');
  }

  /* Reseau de passes : position moyenne + volume des combinaisons. */
  function passNetwork(d, team) {
    var net = d.network[team];
    var isA = team === d.teamNames[0];
    if (!net || !net.nodes.length) return '<p class="empty">Pas assez de passes pour tracer un réseau.</p>';
    var maxLink = net.links.reduce(function (m, l) { return Math.max(m, l.n); }, 1);
    var maxPass = net.nodes.reduce(function (m, x) { return Math.max(m, x.passes); }, 1);
    var byName = {};
    net.nodes.forEach(function (x) { byName[x.name] = x; });

    function mx(x) { return isA ? x : 120 - x; }
    function my(y) { return isA ? y : 80 - y; }

    var links = '';
    net.links.forEach(function (l) {
      var p = byName[l.a], q = byName[l.b];
      if (!p || !q) return;
      links += '<line x1="' + nf(mx(p.x)) + '" y1="' + nf(my(p.y)) + '" x2="' + nf(mx(q.x)) + '" y2="' + nf(my(q.y)) +
        '" stroke="' + (isA ? 'var(--a-line)' : 'var(--b-line)') + '" stroke-width="' + nf(0.25 + l.n / maxLink * 1.5, 2) +
        '" stroke-linecap="round" data-tip="' + esc(shortName(l.a)) + ' ↔ ' + esc(shortName(l.b)) + ' : ' + l.n + ' passes"/>';
    });
    var nodes = '';
    net.nodes.forEach(function (x) {
      var rr = 1.6 + Math.sqrt(x.passes / maxPass) * 2.2;
      nodes += '<circle cx="' + nf(mx(x.x)) + '" cy="' + nf(my(x.y)) + '" r="' + nf(rr, 2) + '" class="' +
        (isA ? 'mark-a' : 'mark-b') + '" stroke="var(--pitch-fill)" stroke-width="0.3" ' +
        'data-tip="' + esc(x.name) + ' · ' + x.passes + ' passes"/>' +
        '<text x="' + nf(mx(x.x)) + '" y="' + nf(my(x.y) - rr - 1) + '" text-anchor="middle" ' +
        'class="pitch-tag">' + esc(x.jersey != null ? x.jersey : shortName(x.name)) + '</text>';
    });
    return '<div class="figure pitchfig"><svg viewBox="-2 -5 124 88" role="img" aria-label="Réseau de passes">' +
      pitchMarkup(0) +
      '<text x="' + (isA ? 1 : 119) + '" y="-1.4" class="pitch-side" text-anchor="' + (isA ? 'start' : 'end') + '">' +
      (isA ? esc(team) + ' →' : '← ' + esc(team)) + '</text>' +
      links + nodes + '</svg></div>';
  }

  /* =========================================================== rendu vues */

  function cmpRow(row, ta, tb, A, B) {
    var va = teamVal(ta, row.k), vb = teamVal(tb, row.k);
    if (va == null && vb == null) return '';
    var na = va == null ? 0 : va, nb = vb == null ? 0 : vb;
    var tot = Math.max(na + nb, 0.0001);
    var wa = na / tot * 100, wb = nb / tot * 100;
    var dir = row.dir == null ? 1 : row.dir;
    var same = na === nb;
    // Le gras dit "a fait mieux", pas "a fait plus" : sur une mesure neutre
    // personne n'est mis en avant, sinon le gras jugerait a la place du lecteur.
    var aLead = false, bLead = false;
    if (dir && !same) {
      aLead = dir > 0 ? na > nb : na < nb;
      bLead = !aLead;
    }
    var suffix = row.suffix || '';
    var note = dir === -1 ? ' <span style="color:var(--ink-3)">(bas = mieux)</span>' :
      (dir === 0 ? ' <span style="color:var(--ink-3)">(sans jugement)</span>' : '');
    // L'ecart se lit depuis le point de vue choisi ; sans point de vue, depuis A.
    var povB = S.pov === B;
    var povSet = S.pov === A || povB;
    var mine = povB ? nb : na, theirs = povB ? na : nb;
    var cell = delta(mine, theirs, dir, row.d, povSet, chipFor(na, nb, dir));
    return '<div class="cmp-row"' + (row.tip ? ' data-tip="' + esc(row.tip) + '"' : '') + '>' +
      '<div class="val a ' + (same ? '' : (aLead ? 'lead' : 'trail')) + '">' + f(va, row.d) + suffix + '</div>' +
      '<div class="cmp-mid">' +
      '<div class="cmp-label">' + esc(row.label) + note + '</div>' +
      '<div class="cmp-bars">' +
      '<div class="track left"><span class="fill" style="width:' + nf(wa) + '%"></span></div>' +
      '<div class="axis"></div>' +
      '<div class="track right"><span class="fill" style="width:' + nf(wb) + '%"></span></div>' +
      '</div></div>' +
      '<div class="val b ' + (same ? '' : (bLead ? 'lead' : 'trail')) + '">' + f(vb, row.d) + suffix + '</div>' +
      '<div class="delta-cell">' + cell + '</div>' +
      '</div>';
  }

  // L'unite va dans l'intitule, pas sur chaque valeur : repetee deux fois
  // elle deborde de la tuile et n'apprend rien de plus.
  function tile(label, va, vb, d, unit, note, dir, A, B) {
    var na = va || 0, nb = vb || 0;
    var povB = S.pov === B;
    var povSet = S.pov === A || povB;
    var dd = dir == null ? 1 : dir;
    var cell = delta(povB ? nb : na, povB ? na : nb, dd, d, povSet, chipFor(na, nb, dd));
    return '<div class="tile">' +
      '<div class="label">' + esc(label) + (unit ? ' <span style="opacity:.7">' + esc(unit) + '</span>' : '') + '</div>' +
      '<div class="duo">' +
      '<span class="side2"><span class="chip a"></span><span class="v">' + f(va, d) + '</span></span>' +
      '<span class="side2"><span class="v">' + f(vb, d) + '</span><span class="chip b"></span></span>' +
      '</div>' +
      '<div class="tilefoot">' + cell +
      (note ? '<span class="note">' + esc(note) + '</span>' : '') + '</div>' +
      '</div>';
  }

  /* La legende dit ce que veut dire chaque signe. Sans elle, une fleche verte
     n'est qu'une decoration ; avec elle, c'est une lecture.                  */
  function valenceLegend(A, B) {
    if (!S.pov) {
      return '<div class="vlegend"><span class="k mute">' +
        '<b>Aucun point de vue.</b> Les écarts sont affichés bruts, sans être jugés. ' +
        'Choisissez une équipe en haut du rapport pour lire le match de son côté.</span></div>';
    }
    return '<div class="vlegend">' +
      '<span class="k"><b>Point de vue :</b>&nbsp;<span class="chip ' + (S.pov === A ? 'a' : 'b') + '"></span>&nbsp;' + esc(S.pov) + '</span>' +
      '<span class="k up"><span class="arw">▲</span>&nbsp;<b>avantage</b></span>' +
      '<span class="k down"><span class="arw">▼</span>&nbsp;<b>déficit</b></span>' +
      '<span class="k mute"><b>gris</b>&nbsp;= mesure de volume ou de contexte, que le rapport ne juge pas</span>' +
      '</div>';
  }

  function viewResume(d) {
    var A = d.teamNames[0], B = d.teamNames[1];
    var ta = d.teams[A], tb = d.teams[B];
    var goals = d.shots.filter(function (s) { return s.goal; })
      .sort(function (p, q) { return p.minute - q.minute; });

    var timeline = goals.length ? goals.map(function (s) {
      return '<div class="tl-row"><div class="tl-min">' + s.minute + "'</div>" +
        '<div class="tl-what"><span class="chip ' + (s.team === A ? 'a' : 'b') + '"></span>' +
        '<span class="who2">' + esc(s.ownGoal ? 'contre son camp' : (s.player || '?')) + '</span>' +
        '<span class="xg">' + esc(s.team) + (s.ownGoal ? '' : ' · xG ' + f(s.xg, 2)) + '</span></div></div>';
    }).join('') : '<p class="empty">Aucun but.</p>';

    return '<div class="stack">' +
      valenceLegend(A, B) +
      '<div class="tiles">' +
      tile('Possession', ta.possession, tb.possession, 1, '%', 'sans jugement', 0, A, B) +
      tile('xG', ta.xg, tb.xg, 2, '', 'buts attendus', 1, A, B) +
      tile('Tirs', ta.shots, tb.shots, 0, '', f(ta.shotsOnTarget) + ' / ' + f(tb.shotsOnTarget) + ' cadrés', 1, A, B) +
      tile('PPDA', ta.ppda, tb.ppda, 1, '', 'bas = pressing intense', -1, A, B) +
      tile('Field tilt', ta.fieldTilt, tb.fieldTilt, 1, '%', 'territoire', 1, A, B) +
      tile('Précision passes', ta.passAcc, tb.passAcc, 1, '%', '', 1, A, B) +
      '</div>' +

      '<div class="card"><header><div><h2>Course aux xG</h2>' +
      '<p class="hint">Chaque marche est un tir. La hauteur de la marche, c’est la qualité de l’occasion. ' +
      'Les points pleins sont les buts.</p></div>' + legend(A, B, 'line') + '</header>' +
      xgRace(d) + '</div>' +

      '<div class="card"><header><div><h2>Carte des tirs</h2>' +
      '<p class="hint">Taille du disque = xG. Contour foncé = but. ' +
      esc(A) + ' attaque vers la droite, ' + esc(B) + ' vers la gauche.</p></div>' +
      legend(A, B, 'dot') + '</header>' +
      shotMap(d) + '</div>' +

      '<div class="card"><header><h2>Les buts</h2></header>' +
      '<div class="timeline">' + timeline + '</div></div>' +
      '</div>';
  }

  function legend(A, B, shape) {
    var s = shape === 'line' ? 'swatch' : 'dot';
    return '<div class="legend">' +
      '<span class="item"><span class="' + s + '" style="background:var(--a)"></span>' + esc(A) + '</span>' +
      '<span class="item"><span class="' + s + '" style="background:var(--b)"></span>' + esc(B) + '</span>' +
      '</div>';
  }

  function viewEquipes(d) {
    var A = d.teamNames[0], B = d.teamNames[1];
    var ta = d.teams[A], tb = d.teams[B];

    var body = GROUPS.map(function (g) {
      return '<div class="cmp-group"><div class="eyebrow">' + esc(g.title) + '</div>' +
        '<div class="cmp">' + g.rows.map(function (r) { return cmpRow(r, ta, tb, A, B); }).join('') + '</div></div>';
    }).join('');

    // radar : 8 axes normalises au maximum des deux equipes
    var axesDef = [
      ['possession', 'Possession', 1], ['xg', 'xG', 2], ['shots', 'Tirs', 0],
      ['progressivePasses', 'Passes prog.', 0], ['finalThirdPasses', 'Dernier tiers', 0],
      ['duelsWon', 'Duels gagnés', 0], ['recoveries', 'Récupérations', 0], ['pressures', 'Pressings', 0]
    ];
    var axes = axesDef.map(function (x) {
      var va = teamVal(ta, x[0]) || 0, vb = teamVal(tb, x[0]) || 0;
      return { label: x[1], a: va, b: vb, araw: va, braw: vb, d: x[2], max: Math.max(va, vb, 0.0001) };
    });

    var netTeam = S.netTeam || A;

    return '<div class="stack">' +
      '<div class="card"><header><div><h2>Profil du match</h2>' +
      '<p class="hint">Chaque axe est mis à l’échelle du meilleur des deux : l’équipe qui touche le bord domine cette mesure.</p></div>' +
      legend(A, B, 'line') + '</header>' +
      '<div style="max-width:480px;margin:0 auto">' + radar(axes, A, B) + '</div></div>' +

      '<div class="card"><header><div><h2>Comparatif détaillé</h2>' +
      '<p class="hint">Les barres se rejoignent au centre : la moitié la plus longue a fait plus. ' +
      'Le gras dit qui a fait <em>mieux</em>, ce qui n’est pas la même chose : sur une mesure sans jugement, personne n’est mis en avant. ' +
      'La colonne de droite donne l’écart.</p></div>' +
      legend(A, B, 'dot') + '</header>' + valenceLegend(A, B) + body + '</div>' +

      '<div class="card"><header><div><h2>Réseau de passes</h2>' +
      '<p class="hint">Position moyenne de chaque joueur au moment où il donne le ballon ; épaisseur du trait = nombre de passes échangées. ' +
      'Combinaisons à partir de 3 passes.</p></div>' +
      '<div class="seg" data-role="netteam">' +
      '<button type="button" data-team="' + esc(A) + '" aria-pressed="' + (netTeam === A) + '">' + esc(A) + '</button>' +
      '<button type="button" data-team="' + esc(B) + '" aria-pressed="' + (netTeam === B) + '">' + esc(B) + '</button>' +
      '</div></header>' +
      passNetwork(d, netTeam) + '</div>' +
      '</div>';
  }

  function viewJoueurs(d) {
    var A = d.teamNames[0], B = d.teamNames[1];
    var cols = COLS[S.playerView];
    var rows = d.players.filter(function (p) {
      return S.teamFilter === 'all' || p.team === S.teamFilter;
    });
    rows.sort(function (p, q) {
      var x = pv(p, S.sortKey), y = pv(q, S.sortKey);
      if (x == null) x = -Infinity;
      if (y == null) y = -Infinity;
      if (x === y) return p.name.localeCompare(q.name);
      return (x - y) * S.sortDir;
    });

    var head = '<tr><th data-sort="name">Joueur</th>' + cols.map(function (c) {
      var on = S.sortKey === c[0];
      return '<th data-sort="' + c[0] + '"' + (on ? ' aria-sort="' + (S.sortDir < 0 ? 'descending' : 'ascending') + '"' : '') + '>' +
        esc(c[1]) + (on ? '<span class="arrow">' + (S.sortDir < 0 ? '▼' : '▲') + '</span>' : '') + '</th>';
    }).join('') + '</tr>';

    // Barre d'ampleur sur la seule colonne triee : elle donne la forme de la
    // distribution sans peindre tout le tableau. Volontairement aux couleurs
    // d'equipe et non vert/rouge - c'est une magnitude, pas un jugement : un
    // gros volume de ballons perdus n'est pas "mauvais" hors contexte.
    var magMax = rows.reduce(function (m, p) {
      return Math.max(m, Math.abs(pv(p, S.sortKey) || 0));
    }, 0);

    var body = rows.map(function (p) {
      return '<tr>' +
        '<td><span class="who"><span class="chip ' + (p.team === A ? 'a' : 'b') + '"></span>' +
        '<span class="nb">' + (p.jersey != null ? p.jersey : '') + '</span>' +
        '<span>' + esc(p.name) + '</span>' +
        '<span class="pos">' + esc(abbrPos(p.position)) + '</span></span></td>' +
        cols.map(function (c) {
          var v = pv(p, c[0]);
          var dd = S.per90 && !PER90_EXEMPT[c[0]] ? Math.max(c[2], 1) : c[2];
          var txt = v ? f(v, dd) : '<span style="color:var(--ink-3)">' + f(0, dd) + '</span>';
          if (c[0] !== S.sortKey || !magMax) return '<td>' + txt + '</td>';
          var w = Math.abs(v || 0) / magMax * 100;
          return '<td class="mag' + (p.team === A ? '' : ' tb') + '">' +
            '<span class="bar" style="width:' + nf(w) + '%"></span><span>' + txt + '</span></td>';
        }).join('') +
        '</tr>';
    }).join('');

    return '<div class="stack"><div class="card">' +
      '<header><div><h2>Joueurs</h2>' +
      '<p class="hint">Cliquez un en-tête pour trier. ' +
      (S.per90 ? 'Valeurs ramenées à 90 minutes : un remplaçant entré à la 80e est comparable à un titulaire.' :
        'Valeurs brutes du match.') + '</p></div></header>' +
      '<div class="controls">' +
      '<div class="seg" data-role="teamfilter">' +
      '<button type="button" data-v="all" aria-pressed="' + (S.teamFilter === 'all') + '">Les deux</button>' +
      '<button type="button" data-v="' + esc(A) + '" aria-pressed="' + (S.teamFilter === A) + '">' + esc(A) + '</button>' +
      '<button type="button" data-v="' + esc(B) + '" aria-pressed="' + (S.teamFilter === B) + '">' + esc(B) + '</button>' +
      '</div>' +
      '<div class="seg" data-role="playerview">' +
      '<button type="button" data-v="general" aria-pressed="' + (S.playerView === 'general') + '">Général</button>' +
      '<button type="button" data-v="offensif" aria-pressed="' + (S.playerView === 'offensif') + '">Offensif</button>' +
      '<button type="button" data-v="defensif" aria-pressed="' + (S.playerView === 'defensif') + '">Défensif</button>' +
      '</div>' +
      '<div class="seg" data-role="per90">' +
      '<button type="button" data-v="0" aria-pressed="' + (!S.per90) + '">Total</button>' +
      '<button type="button" data-v="1" aria-pressed="' + (S.per90) + '">Par 90 min</button>' +
      '</div>' +
      '</div>' +
      '<div class="tablewrap"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' +
      '</div></div>';
  }

  function abbrPos(p) {
    if (!p) return '';
    var m = {
      'Goalkeeper': 'GB', 'Right Back': 'DD', 'Left Back': 'DG',
      'Right Center Back': 'DCD', 'Left Center Back': 'DCG', 'Center Back': 'DC',
      'Right Wing Back': 'PD', 'Left Wing Back': 'PG',
      'Right Defensive Midfield': 'MDD', 'Left Defensive Midfield': 'MDG', 'Center Defensive Midfield': 'MDC',
      'Right Midfield': 'MD', 'Left Midfield': 'MG', 'Center Midfield': 'MC',
      'Right Center Midfield': 'MCD', 'Left Center Midfield': 'MCG',
      'Right Attacking Midfield': 'MOD', 'Left Attacking Midfield': 'MOG', 'Center Attacking Midfield': 'MOC',
      'Right Wing': 'AD', 'Left Wing': 'AG',
      'Right Center Forward': 'ATD', 'Left Center Forward': 'ATG', 'Center Forward': 'BU',
      'Secondary Striker': 'SA'
    };
    return m[p] || p;
  }

  /* --------------------------------------------------------------- duel */
  var DUEL_AXES = [
    ['touches', 'Touches', 0], ['passes', 'Passes', 0], ['progressivePasses', 'Passes prog.', 0],
    ['keyPasses', 'Passes clés', 0], ['xg', 'xG', 2], ['xa', 'xA', 2],
    ['duelsWon', 'Duels gagnés', 0], ['pressures', 'Pressings', 0],
    ['recoveries', 'Récupérations', 0], ['progressiveCarries', 'Cond. prog.', 0]
  ];

  function viewDuel(d) {
    var A = d.teamNames[0], B = d.teamNames[1];
    var pool = d.players.filter(function (p) { return p.minutes >= 1; });
    if (!S.duelA) {
      var ca = pool.filter(function (p) { return p.team === A; })
        .slice().sort(function (x, y) { return y.touches - x.touches; })[0];
      S.duelA = ca ? ca.name : (pool[0] && pool[0].name);
    }
    if (!S.duelB) {
      var cb = pool.filter(function (p) { return p.team === B; })
        .slice().sort(function (x, y) { return y.touches - x.touches; })[0];
      S.duelB = cb ? cb.name : (pool[1] && pool[1].name);
    }
    var pa = pool.filter(function (p) { return p.name === S.duelA; })[0];
    var pb = pool.filter(function (p) { return p.name === S.duelB; })[0];
    if (!pa || !pb) return '<p class="empty">Sélectionnez deux joueurs.</p>';

    function opts(sel) {
      return [A, B].map(function (t) {
        return '<optgroup label="' + esc(t) + '">' + pool.filter(function (p) { return p.team === t; })
          .map(function (p) {
            return '<option value="' + esc(p.name) + '"' + (p.name === sel ? ' selected' : '') + '>' +
              esc(p.name) + ' · ' + esc(abbrPos(p.position)) + '</option>';
          }).join('') + '</optgroup>';
      }).join('');
    }

    // Normalisation sur le meilleur du match : on situe le joueur parmi les 22.
    var axes = DUEL_AXES.map(function (x) {
      var maxAll = pool.reduce(function (m, p) { return Math.max(m, pv(p, x[0]) || 0); }, 0.0001);
      return {
        label: x[1], d: S.per90 ? Math.max(x[2], 1) : x[2],
        a: pv(pa, x[0]) || 0, b: pv(pb, x[0]) || 0,
        araw: pv(pa, x[0]) || 0, braw: pv(pb, x[0]) || 0,
        max: maxAll
      };
    });

    var tableRows = DUEL_AXES.concat([
      ['minutes', 'Minutes jouées', 0], ['shots', 'Tirs', 0], ['goals', 'Buts', 0],
      ['passAcc', 'Précision passes', 1], ['turnovers', 'Ballons perdus', 0],
      ['interceptions', 'Interceptions', 0], ['aerialsWon', 'Duels aériens gagnés', 0]
    ]).map(function (x) {
      var va = pv(pa, x[0]) || 0, vb = pv(pb, x[0]) || 0;
      var dd = S.per90 && !PER90_EXEMPT[x[0]] ? Math.max(x[2], 1) : x[2];
      var diff = va - vb;
      return '<tr><td>' + esc(x[1]) + (x[0] === 'passAcc' ? ' (%)' : '') + '</td>' +
        '<td>' + f(va, dd) + '</td><td>' + f(vb, dd) + '</td>' +
        '<td>' + gap(diff, dd) + '</td></tr>';
    }).join('');

    function card(p, side) {
      return '<div class="tile" style="gap:.3rem">' +
        '<div class="label"><span class="chip ' + side + '" style="display:inline-block;margin-right:.4rem"></span>' +
        esc(p.team) + '</div>' +
        '<div style="font-size:var(--step-2);font-weight:700;letter-spacing:-.02em">' + esc(p.name) + '</div>' +
        '<div class="note">' + esc(fullPos(p.position)) + ' · ' + f(p.minutes) + ' min' +
        (p.jersey != null ? ' · n° ' + p.jersey : '') + '</div></div>';
    }

    return '<div class="stack"><div class="card">' +
      '<header><div><h2>Duel individuel</h2>' +
      '<p class="hint">Chaque axe est mis à l’échelle du meilleur joueur du match : toucher le bord, c’est être premier des 22 sur cette mesure.</p></div></header>' +
      '<div class="controls">' +
      '<label class="field"><span class="eyebrow">Joueur A</span><select data-role="duelA">' + opts(S.duelA) + '</select></label>' +
      '<label class="field"><span class="eyebrow">Joueur B</span><select data-role="duelB">' + opts(S.duelB) + '</select></label>' +
      '<div class="seg" data-role="per90" style="align-self:flex-end">' +
      '<button type="button" data-v="0" aria-pressed="' + (!S.per90) + '">Total</button>' +
      '<button type="button" data-v="1" aria-pressed="' + (S.per90) + '">Par 90 min</button>' +
      '</div>' +
      '</div>' +
      '<div class="two-col" style="align-items:start">' +
      '<div>' + card(pa, 'a') + '<div style="height:.6rem"></div>' + card(pb, 'b') +
      '<div style="height:1rem"></div>' +
      '<div class="tablewrap"><table><thead><tr><th>Mesure</th><th>' + esc(shortName(pa.name)) +
      '</th><th>' + esc(shortName(pb.name)) + '</th><th>Écart</th></tr></thead><tbody>' +
      tableRows + '</tbody></table></div></div>' +
      '<div>' + radar(axes, pa.name, pb.name) +
      '<div style="margin-top:.5rem">' + legend(pa.name, pb.name, 'line') + '</div></div>' +
      '</div></div></div>';
  }

  function fullPos(p) {
    if (!p) return 'poste inconnu';
    var m = {
      'Goalkeeper': 'Gardien', 'Right Back': 'Latéral droit', 'Left Back': 'Latéral gauche',
      'Right Center Back': 'Défenseur central droit', 'Left Center Back': 'Défenseur central gauche',
      'Center Back': 'Défenseur central', 'Right Wing Back': 'Piston droit', 'Left Wing Back': 'Piston gauche',
      'Center Defensive Midfield': 'Milieu défensif', 'Right Defensive Midfield': 'Milieu défensif droit',
      'Left Defensive Midfield': 'Milieu défensif gauche', 'Center Midfield': 'Milieu central',
      'Right Center Midfield': 'Milieu central droit', 'Left Center Midfield': 'Milieu central gauche',
      'Right Midfield': 'Milieu droit', 'Left Midfield': 'Milieu gauche',
      'Center Attacking Midfield': 'Meneur de jeu', 'Right Wing': 'Ailier droit', 'Left Wing': 'Ailier gauche',
      'Right Center Forward': 'Attaquant droit', 'Left Center Forward': 'Attaquant gauche',
      'Center Forward': 'Avant-centre', 'Secondary Striker': 'Second attaquant'
    };
    return m[p] || p;
  }

  /* ------------------------------------------------------------- import */
  function viewImport() {
    return '<div class="stack"><div class="card">' +
      '<header><div><h2>Importer un match</h2>' +
      '<p class="hint">Tout se passe dans votre navigateur : aucun fichier n’est envoyé sur un serveur. ' +
      'Vous pouvez déposer plusieurs fichiers d’un coup (événements + composition).</p></div></header>' +
      '<div class="drop" id="drop">' +
      '<h2>Déposez le fichier ici</h2>' +
      '<p class="hint">JSON StatsBomb, XML de codage vidéo, ou CSV</p>' +
      '<button type="button" class="btn" id="pick">Choisir un fichier</button>' +
      '<input type="file" id="file" accept=".json,.xml,.csv,.txt" multiple>' +
      '</div>' +
      '<div id="status"></div>' +
      '<div class="fmt">' +
      '<div class="f"><code>.json</code><p><b>StatsBomb</b> — un fichier d’événements par match. ' +
      'Rapport complet : équipes, joueurs, xG, tirs, pressing, réseau de passes. Ajoutez le fichier de composition ' +
      'pour les numéros et le temps de jeu exact.</p></div>' +
      '<div class="f"><code>.xml</code><p><b>Codage vidéo</b> (SportsCode, Nacsport, LongoMatch) — balises ' +
      '<code>&lt;instance&gt;</code>. Donne le décompte des actions codées, pas les xG : un rapport ne peut ' +
      'contenir que ce que l’analyste a codé.</p></div>' +
      '<div class="f"><code>.csv</code><p><b>Tableau</b> — une ligne par joueur ou par équipe. ' +
      'Colonnes numériques détectées automatiquement, puis comparaison de deux lignes au choix.</p></div>' +
      '</div>' +
      '</div></div>';
  }

  /* -------------------------------------------------- vues non-StatsBomb */
  function viewSportsCode(d) {
    var maxN = d.codes.reduce(function (m, c) { return Math.max(m, c.count); }, 1);
    var rows = d.codes.map(function (c) {
      return '<tr><td>' + esc(c.code) + '</td><td>' + c.count + '</td>' +
        '<td>' + f(c.duration, 0) + ' s</td>' +
        '<td style="width:40%"><span style="display:block;height:8px;border-radius:3px;background:var(--a);width:' +
        nf(c.count / maxN * 100) + '%"></span></td></tr>';
    }).join('');
    var groups = Object.keys(d.groups).map(function (g) {
      var items = Object.keys(d.groups[g]).sort(function (a, b) { return d.groups[g][b] - d.groups[g][a]; });
      return '<div class="cmp-group"><div class="eyebrow">' + esc(g) + '</div><div class="tablewrap"><table><tbody>' +
        items.map(function (it) {
          return '<tr><td>' + esc(it) + '</td><td>' + d.groups[g][it] + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }).join('');
    return '<div class="stack"><div class="card">' +
      '<header><div><h2>Actions codées</h2><p class="hint">' + d.instances.length +
      ' instances lues. Un XML de codage vidéo ne contient que ce qui a été codé : pas de xG, pas de coordonnées.</p></div></header>' +
      '<div class="tablewrap"><table><thead><tr><th>Code</th><th>Nombre</th><th>Durée</th><th></th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' + groups + '</div></div>';
  }

  function viewCsv(d) {
    var nums = KMR.numericColumns(d);
    var labelCol = d.columns.filter(function (c) { return nums.indexOf(c) === -1; })[0] || d.columns[0];
    var names = d.rows.map(function (r, i) { return r[labelCol] || 'ligne ' + (i + 1); });
    if (S.csvA == null) S.csvA = 0;
    if (S.csvB == null) S.csvB = Math.min(1, d.rows.length - 1);
    var ra = d.rows[S.csvA], rb = d.rows[S.csvB];
    function num(r, c) { var v = parseFloat(String(r[c]).replace(',', '.')); return isNaN(v) ? 0 : v; }

    var axes = nums.slice(0, 10).map(function (c) {
      var maxAll = d.rows.reduce(function (m, r) { return Math.max(m, num(r, c)); }, 0.0001);
      return { label: c, a: num(ra, c), b: num(rb, c), araw: num(ra, c), braw: num(rb, c), d: 1, max: maxAll };
    });
    var rows = nums.map(function (c) {
      var va = num(ra, c), vb = num(rb, c), diff = va - vb;
      return '<tr><td>' + esc(c) + '</td><td>' + f(va, 2) + '</td><td>' + f(vb, 2) + '</td>' +
        '<td>' + gap(diff, 2) + '</td></tr>';
    }).join('');
    function sel(role, cur) {
      return '<select data-role="' + role + '">' + names.map(function (n, i) {
        return '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + esc(n) + '</option>';
      }).join('') + '</select>';
    }
    return '<div class="stack"><div class="card">' +
      '<header><div><h2>Comparaison</h2><p class="hint">' + d.rows.length + ' lignes, ' +
      nums.length + ' colonnes numériques détectées. Axes du radar mis à l’échelle du maximum de la colonne.</p></div></header>' +
      '<div class="controls">' +
      '<label class="field"><span class="eyebrow">Ligne A</span>' + sel('csvA', S.csvA) + '</label>' +
      '<label class="field"><span class="eyebrow">Ligne B</span>' + sel('csvB', S.csvB) + '</label></div>' +
      '<div class="two-col" style="align-items:start">' +
      '<div class="tablewrap"><table><thead><tr><th>Colonne</th><th>' + esc(names[S.csvA]) + '</th><th>' +
      esc(names[S.csvB]) + '</th><th>Écart</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div>' + (axes.length ? radar(axes, names[S.csvA], names[S.csvB]) : '<p class="empty">Aucune colonne numérique.</p>') +
      '<div style="margin-top:.5rem">' + legend(names[S.csvA], names[S.csvB], 'line') + '</div></div>' +
      '</div></div></div>';
  }

  /* ============================================================== rendu */
  var TABS_SB = [
    ['resume', 'Résumé'], ['equipes', 'Équipes'], ['joueurs', 'Joueurs'],
    ['duel', 'Duel'], ['import', 'Données']
  ];

  /* Le point de vue est ce qui donne un sens au vert et au rouge : sans
     equipe de reference, "mieux" ne veut rien dire dans un match a deux.    */
  function headControls(A, B) {
    var themeLabel = { light: '◑ Clair', dark: '◐ Sombre' }[S.theme] || '◐◑ Auto';
    function povBtn(v, label) {
      return '<button type="button" data-v="' + esc(v) + '" aria-pressed="' + (S.pov === (v || null)) + '">' +
        esc(label) + '</button>';
    }
    return '<div class="hctl">' +
      '<span class="eyebrow">Point de vue</span>' +
      '<div class="seg tiny" data-role="pov">' +
      povBtn(A, A) + povBtn(B, B) + povBtn('', 'Neutre') +
      '</div>' +
      '<button type="button" class="btn tiny" data-role="theme" ' +
      'title="Thème du rapport : auto, clair, sombre">' + themeLabel + '</button>' +
      '</div>';
  }

  /* Le theme suit l'OS par defaut, et se force pour la salle video ou pour
     un PDF a imprimer. Un navigateur peut refuser localStorage (navigation
     privee, fichier local verrouille) : on ne doit jamais casser pour ca.    */
  function applyTheme() {
    var el = document.documentElement;
    if (S.theme === 'light' || S.theme === 'dark') el.setAttribute('data-theme', S.theme);
    else el.removeAttribute('data-theme');
    try { if (S.theme) localStorage.setItem('kmr-theme', S.theme); else localStorage.removeItem('kmr-theme'); }
    catch (err) { /* stockage indisponible : le choix ne survivra pas au rechargement, tant pis */ }
  }

  function render() {
    var d = S.data;
    // Au premier rendu d'un match, on se place du cote de l'equipe A : sans
    // point de vue le vert et le rouge n'auraient rien a dire.
    if (d && d.kind === 'statsbomb' && S.pov === null && !S.povTouched) S.pov = d.teamNames[0];
    var head = document.getElementById('head');
    var main = document.getElementById('main');
    var tabs = [];

    if (d && d.kind === 'statsbomb') {
      var A = d.teamNames[0], B = d.teamNames[1];
      var ta = d.teams[A], tb = d.teams[B];
      head.innerHTML =
        '<div class="wrap"><div class="scoreline">' +
        '<div class="side"><div class="club">' + esc(A) + '</div>' +
        '<div class="meta"><span class="chip a"></span>' + esc(formation(ta.formation)) + '</div></div>' +
        '<div class="score"><span>' + d.match.score[0] + '</span><span class="sep">:</span><span>' + d.match.score[1] + '</span></div>' +
        '<div class="side right"><div class="club">' + esc(B) + '</div>' +
        '<div class="meta"><span class="chip b"></span>' + esc(formation(tb.formation)) + '</div></div>' +
        '</div></div>' +
        '<div class="possbar" title="Possession"><span class="pa" style="width:' + nf(ta.possession, 2) + '%"></span>' +
        '<span class="gapline"></span>' +
        '<span class="pb" style="width:' + nf(tb.possession, 2) + '%"></span></div>' +
        '<div class="wrap"><div class="hbar"><div class="tabs" role="tablist">' +
        TABS_SB.map(function (t) {
          return '<button type="button" class="tab" role="tab" data-tab="' + t[0] + '" aria-selected="' +
            (S.tab === t[0]) + '">' + esc(t[1]) + '</button>';
        }).join('') + '</div>' + headControls(A, B) + '</div></div>';
      tabs = TABS_SB;
    } else {
      var sub = 'importez un fichier pour commencer';
      if (d && d.kind === 'sportscode') sub = d.instances.length + ' actions codées · ' + d.codes.length + ' codes';
      else if (d && d.kind === 'csv') sub = d.rows.length + ' lignes · ' + d.columns.length + ' colonnes';
      head.innerHTML = '<div class="wrap"><div class="scoreline">' +
        '<div class="side"><div class="club">Rapport de match</div>' +
        '<div class="meta">' + esc(sub) + '</div></div>' +
        '<div></div><div></div></div></div>';
    }

    var html;
    if (!d) html = viewImport();
    else if (d.kind === 'statsbomb') {
      if (S.tab === 'resume') html = viewResume(d);
      else if (S.tab === 'equipes') html = viewEquipes(d);
      else if (S.tab === 'joueurs') html = viewJoueurs(d);
      else if (S.tab === 'duel') html = viewDuel(d);
      else html = viewImport();
    }
    else if (d.kind === 'sportscode') html = viewSportsCode(d) + viewImport();
    else if (d.kind === 'csv') html = viewCsv(d) + viewImport();

    main.innerHTML = '<div class="wrap">' + html + footer() + '</div>';
  }

  function footer() {
    var d = S.data;
    var left = 'aucun match chargé';
    if (d && d.kind === 'statsbomb') {
      left = f(d.match.events) + ' événements · ' + d.players.length + ' joueurs · ' + d.match.minutes + ' minutes';
    } else if (d && d.kind === 'sportscode') {
      left = d.instances.length + ' instances lues';
    } else if (d && d.kind === 'csv') {
      left = d.rows.length + ' lignes lues';
    }
    return '<div class="foot"><span>' + esc(left) + '</span>' +
      '<span>Ctrl+P pour exporter le rapport en PDF</span></div>';
  }

  /* ============================================================ evenements */
  function on(sel, ev, fn) { document.addEventListener(ev, function (e) {
    var t = e.target.closest ? e.target.closest(sel) : null;
    if (t) fn(e, t);
  }); }

  on('.tab', 'click', function (e, t) {
    S.tab = t.dataset.tab;
    render();
    // Changer d'onglet doit repartir du haut, sinon on atterrit au milieu
    // d'une vue dont on n'a jamais vu le titre.
    window.scrollTo(0, 0);
  });

  on('[data-role="teamfilter"] button', 'click', function (e, t) { S.teamFilter = t.dataset.v; render(); });
  on('[data-role="playerview"] button', 'click', function (e, t) {
    S.playerView = t.dataset.v;
    var keys = COLS[S.playerView].map(function (c) { return c[0]; });
    if (keys.indexOf(S.sortKey) === -1) { S.sortKey = 'minutes'; S.sortDir = -1; }
    render();
  });
  on('[data-role="per90"] button', 'click', function (e, t) { S.per90 = t.dataset.v === '1'; render(); });
  on('[data-role="netteam"] button', 'click', function (e, t) { S.netTeam = t.dataset.team; render(); });
  on('[data-role="pov"] button', 'click', function (e, t) {
    S.pov = t.dataset.v || null;
    S.povTouched = true;   // un choix explicite de Neutre ne doit pas etre ecrase
    render();
  });
  on('[data-role="theme"]', 'click', function () {
    S.theme = S.theme === 'light' ? 'dark' : (S.theme === 'dark' ? null : 'light');
    applyTheme();
    render();
  });

  // Un tablist se parcourt aux fleches : c'est ce qu'attend un lecteur d'ecran,
  // et c'est plus rapide a la main pendant un debrief.
  on('.tab', 'keydown', function (e, t) {
    var dir = e.key === 'ArrowRight' ? 1 : (e.key === 'ArrowLeft' ? -1 : 0);
    if (!dir) return;
    e.preventDefault();
    var list = [].slice.call(document.querySelectorAll('.tab'));
    var i = list.indexOf(t);
    var next = list[(i + dir + list.length) % list.length];
    if (next) next.click();
    var again = document.querySelector('.tab[data-tab="' + next.dataset.tab + '"]');
    if (again) again.focus();
  });

  on('th[data-sort]', 'click', function (e, t) {
    var k = t.dataset.sort;
    if (S.sortKey === k) S.sortDir = -S.sortDir;
    else { S.sortKey = k; S.sortDir = k === 'name' ? 1 : -1; }
    render();
  });

  document.addEventListener('change', function (e) {
    var r = e.target.dataset ? e.target.dataset.role : null;
    if (r === 'duelA') { S.duelA = e.target.value; render(); }
    else if (r === 'duelB') { S.duelB = e.target.value; render(); }
    else if (r === 'csvA') { S.csvA = parseInt(e.target.value, 10); render(); }
    else if (r === 'csvB') { S.csvB = parseInt(e.target.value, 10); render(); }
  });

  /* ------------------------------------------------------------ infobulle */
  var tip = document.createElement('div');
  tip.className = 'tip';
  document.body.appendChild(tip);

  document.addEventListener('mousemove', function (e) {
    var t = e.target.closest ? e.target.closest('[data-tip]') : null;
    if (!t) { tip.dataset.show = '0'; return; }
    tip.innerHTML = t.getAttribute('data-tip');
    tip.dataset.show = '1';
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var x = Math.min(e.clientX + 14, window.innerWidth - w - 8);
    var y = e.clientY - h - 12;
    if (y < 8) y = e.clientY + 18;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  });
  document.addEventListener('mouseleave', function () { tip.dataset.show = '0'; });

  /* --------------------------------------------------------------- import */
  function setStatus(kind, msg) {
    var el = document.getElementById('status');
    if (!el) return;
    if (!kind) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="status ' + kind + '"><span class="ico">' +
      (kind === 'err' ? '!' : '✓') + '</span><span>' + esc(msg) + '</span></div>';
  }

  function looksLikeEvents(j) {
    return Array.isArray(j) && j.length > 0 && j[0] && j[0].type && j[0].type.name;
  }
  function looksLikeLineups(j) {
    return Array.isArray(j) && j.length > 0 && j[0] && j[0].team_name && j[0].lineup;
  }

  function handleFiles(list) {
    var files = Array.prototype.slice.call(list);
    if (!files.length) return;
    var remaining = files.length;
    var problems = [];

    files.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          consume(file.name, String(reader.result));
        } catch (err) {
          problems.push(file.name + ' : ' + err.message);
        }
        if (--remaining === 0) finish(problems);
      };
      reader.onerror = function () {
        problems.push(file.name + ' : lecture impossible.');
        if (--remaining === 0) finish(problems);
      };
      reader.readAsText(file);
    });
  }

  function consume(name, text) {
    var lower = name.toLowerCase();
    if (/\.json$/.test(lower) || /^\s*[\[{]/.test(text)) {
      var j;
      try { j = JSON.parse(text); }
      catch (err) { throw new Error('JSON invalide (' + err.message + ').'); }
      if (looksLikeEvents(j)) { S.pending.events = j; return; }
      if (looksLikeLineups(j)) { S.pending.lineups = j; return; }
      throw new Error('JSON lu, mais ce n’est ni un fichier d’événements ni une composition StatsBomb.');
    }
    if (/\.xml$/.test(lower) || /^\s*<\?xml|^\s*</.test(text)) {
      var doc = new DOMParser().parseFromString(text, 'text/xml');
      if (doc.getElementsByTagName('parsererror').length) throw new Error('XML mal formé.');
      S.data = KMR.analyseSportsCode(doc);
      S.tab = 'resume';
      return;
    }
    S.data = KMR.parseCSV(text);
    S.csvA = 0; S.csvB = 1;
  }

  function finish(problems) {
    if (S.pending.events) {
      try {
        S.data = KMR.analyseStatsBomb(S.pending.events, S.pending.lineups);
        S.tab = 'resume';
        S.duelA = S.duelB = null;
        S.netTeam = null;
        S.pov = null;
        S.povTouched = false;
        S.sortKey = 'minutes'; S.sortDir = -1;
        S.teamFilter = 'all';
      } catch (err) {
        problems.push(err.message);
      }
      S.pending.events = null;
      S.pending.lineups = null;
    }
    render();
    if (problems.length) setStatus('err', problems.join(' · '));
    else if (S.data) {
      var d = S.data;
      setStatus('ok', d.kind === 'statsbomb'
        ? 'Rapport généré : ' + d.teamNames[0] + ' ' + d.match.score[0] + '-' + d.match.score[1] + ' ' + d.teamNames[1] + '.'
        : 'Fichier chargé.');
    }
  }

  document.addEventListener('click', function (e) {
    if (e.target.id === 'pick') document.getElementById('file').click();
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'file') handleFiles(e.target.files);
  });
  ['dragenter', 'dragover'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var z = document.getElementById('drop');
      if (!z) return;
      e.preventDefault();
      z.classList.add('over');
    });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var z = document.getElementById('drop');
      if (z) z.classList.remove('over');
      if (ev === 'drop') {
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
      }
    });
  });

  /* ------------------------------------------------------------- demarrage */
  try {
    var saved = localStorage.getItem('kmr-theme');
    if (saved === 'light' || saved === 'dark') S.theme = saved;
  } catch (err) { /* pas de stockage : on reste sur le theme du systeme */ }
  applyTheme();

  var demoE = document.getElementById('demo-events');
  var demoL = document.getElementById('demo-lineups');
  if (demoE) {
    try {
      S.data = KMR.analyseStatsBomb(
        JSON.parse(demoE.textContent),
        demoL ? JSON.parse(demoL.textContent) : null
      );
    } catch (err) {
      if (window.console) console.error('demo:', err);
    }
  }
  render();
})();
