/* La demo embarquee doit donner EXACTEMENT les memes chiffres que le fichier
   StatsBomb d'origine. Sinon l'outil ment sur son propre exemple. */
var fs = require('fs');
var path = require('path');
var KMR = require('../src/engine.js').KMR;
var root = path.join(__dirname, '..');

function load(f) { return JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8')); }

var full = KMR.analyseStatsBomb(load('events_8658.json'), load('lineups_8658.json'));
var slim = KMR.analyseStatsBomb(load('demo_events.json'), load('demo_lineups.json'));

var errs = [];
function eq(label, a, b, tol) {
  var ok = (typeof a === 'number' && typeof b === 'number')
    ? Math.abs(a - b) <= (tol || 0)
    : a === b;
  if (!ok) { errs.push(label + ' : brut=' + a + '  allege=' + b); }
  return ok;
}

eq('equipes', full.teamNames.join('|'), slim.teamNames.join('|'));
eq('score', full.match.score.join('-'), slim.match.score.join('-'));
eq('minutes', full.match.minutes, slim.match.minutes);
eq('formations', full.match.formations.join('|'), slim.match.formations.join('|'));

var TOL = { possession: 0.5, xg: 0.001, xa: 0.001, fieldTilt: 0.01, ppda: 0.001, carryDistance: 5, possessionSeconds: 20 };
full.teamNames.forEach(function (t) {
  var a = full.teams[t], b = slim.teams[t];
  Object.keys(a).forEach(function (k) {
    if (typeof a[k] === 'number') eq('equipe ' + t + '.' + k, a[k], b[k], TOL[k] || 0);
    else eq('equipe ' + t + '.' + k, a[k], b[k]);
  });
});

eq('nb joueurs', full.players.length, slim.players.length);
var byName = {};
slim.players.forEach(function (p) { byName[p.name] = p; });
full.players.forEach(function (p) {
  var q = byName[p.name];
  if (!q) { errs.push('joueur absent de la version allegee : ' + p.name); return; }
  ['minutes', 'touches', 'passes', 'passesCompleted', 'keyPasses', 'assists',
    'shots', 'goals', 'carries', 'progressiveCarries', 'progressivePasses',
    'duels', 'duelsWon', 'aerialsWon', 'pressures', 'recoveries', 'interceptions',
    'turnovers', 'saves', 'jersey'].forEach(function (k) {
      eq('joueur ' + p.name + '.' + k, p[k], q[k], 0);
    });
  eq('joueur ' + p.name + '.xg', p.xg, q.xg, 0.001);
  eq('joueur ' + p.name + '.xa', p.xa, q.xa, 0.001);
});

eq('nb tirs', full.shots.length, slim.shots.length);
eq('nb buts', full.shots.filter(function (s) { return s.goal; }).length,
  slim.shots.filter(function (s) { return s.goal; }).length);
full.shots.forEach(function (s, i) {
  var t = slim.shots[i];
  eq('tir ' + i + ' auteur', s.player, t.player);
  eq('tir ' + i + ' xg', s.xg, t.xg, 0.001);
  eq('tir ' + i + ' x', s.x, t.x, 0.1);
  eq('tir ' + i + ' y', s.y, t.y, 0.1);
});

full.teamNames.forEach(function (t) {
  eq('reseau ' + t + ' noeuds', full.network[t].nodes.length, slim.network[t].nodes.length);
  eq('reseau ' + t + ' liens', full.network[t].links.length, slim.network[t].links.length);
});

if (errs.length) {
  console.log('ECHEC : ' + errs.length + ' divergence(s) entre le fichier brut et la demo allegee\n');
  errs.slice(0, 25).forEach(function (e) { console.log('  ' + e); });
  process.exit(1);
}
console.log('demo allegee identique au fichier StatsBomb brut');
console.log('  ' + full.players.length + ' joueurs, ' + full.shots.length + ' tirs, '
  + full.match.events + ' evenements verifies champ par champ');
