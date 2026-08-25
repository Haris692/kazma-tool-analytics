/* Verification du moteur sur France - Croatie, finale CDM 2018 (match 8658). */
var fs = require('fs');
var path = require('path');
var KMR = require('../src/engine.js').KMR;

var root = path.join(__dirname, '..');
var events = JSON.parse(fs.readFileSync(path.join(root, 'data/events_8658.json'), 'utf8'));
var lineups = JSON.parse(fs.readFileSync(path.join(root, 'data/lineups_8658.json'), 'utf8'));

var r = KMR.analyseStatsBomb(events, lineups);
var A = r.teamNames[0], B = r.teamNames[1];
var ta = r.teams[A], tb = r.teams[B];

function n(v, d) { return v == null ? '-' : Number(v).toFixed(d == null ? 0 : d); }
function line(label, a, b, d) {
  console.log(label.padEnd(26) + String(n(a, d)).padStart(9) + String(n(b, d)).padStart(9));
}

console.log('\n=== ' + A + ' ' + r.match.score[0] + ' - ' + r.match.score[1] + ' ' + B + ' ===');
console.log('duree ' + r.match.minutes + ' min | ' + r.match.events + ' evenements');
console.log('formations : ' + r.match.formations.join('  /  '));
console.log(''.padEnd(26) + A.padStart(9) + B.padStart(9));
line('Possession %', ta.possession, tb.possession, 1);
line('Tirs', ta.shots, tb.shots);
line('  dont cadres', ta.shotsOnTarget, tb.shotsOnTarget);
line('  dont dans la surface', ta.shotsInBox, tb.shotsInBox);
line('Buts', ta.goals, tb.goals);
line('xG', ta.xg, tb.xg, 2);
line('Passes', ta.passes, tb.passes);
line('Passes reussies', ta.passesCompleted, tb.passesCompleted);
line('Precision passes %', ta.passAcc, tb.passAcc, 1);
line('Passes prog.', ta.progressivePasses, tb.progressivePasses);
line('Passes dernier tiers', ta.finalThirdPasses, tb.finalThirdPasses);
line('Passes dans la surface', ta.passesIntoBox, tb.passesIntoBox);
line('Centres', ta.crosses, tb.crosses);
line('Passes cles', ta.keyPasses, tb.keyPasses);
line('Passes decisives', ta.assists, tb.assists);
line('xA', ta.xa, tb.xa, 2);
line('Conduites', ta.carries, tb.carries);
line('Conduites prog.', ta.progressiveCarries, tb.progressiveCarries);
line('Dribbles reussis', ta.dribblesCompleted, tb.dribblesCompleted);
line('Duels gagnes', ta.duelsWon, tb.duelsWon);
line('Duels', ta.duels, tb.duels);
line('Duels aeriens gagnes', ta.aerialsWon, tb.aerialsWon);
line('Duels aeriens perdus', ta.aerialsLost, tb.aerialsLost);
line('Tacles', ta.tackles, tb.tackles);
line('Pressings', ta.pressures, tb.pressures);
line('Contre-pressings', ta.counterpressures, tb.counterpressures);
line('Recuperations', ta.recoveries, tb.recoveries);
line('Interceptions', ta.interceptions, tb.interceptions);
line('Degagements', ta.clearances, tb.clearances);
line('Contres', ta.blocks, tb.blocks);
line('Ballons perdus', ta.turnovers, tb.turnovers);
line('Fautes commises', ta.foulsCommitted, tb.foulsCommitted);
line('Corners', ta.corners, tb.corners);
line('Hors-jeu', ta.offsides, tb.offsides);
line('Cartons jaunes', ta.yellowCards, tb.yellowCards);
line('Arrets du gardien', ta.saves, tb.saves);
line('PPDA', ta.ppda, tb.ppda, 2);
line('Field tilt %', ta.fieldTilt, tb.fieldTilt, 1);

console.log('\n--- controles de coherence ---');
var errs = [];
function check(cond, msg) { console.log((cond ? '  OK   ' : '  ECHEC') + '  ' + msg); if (!cond) errs.push(msg); }

check(Math.abs(ta.possession + tb.possession - 100) < 0.01, 'possession somme a 100');
check(r.match.score[0] === 4 && r.match.score[1] === 2, 'score = 4-2 (resultat reel)');
check(ta.passesCompleted > 0 && tb.passesCompleted > 0, 'passes reussies non nulles (piege outcome absent)');
check(ta.passesCompleted <= ta.passes, 'passes reussies <= passes tentees');
check(ta.shotsOnTarget >= ta.goals, 'tirs cadres >= buts');
check(tb.shotsOnTarget >= tb.goals, 'tirs cadres >= buts (adverse)');
check(ta.xg > 0 && tb.xg > 0, 'xG non nuls');
check(ta.ppda != null && tb.ppda != null, 'PPDA calculable');
check(Math.abs(ta.fieldTilt + tb.fieldTilt - 100) < 0.01, 'field tilt somme a 100');

var goalsFromShots = r.shots.filter(function (s) { return s.goal; }).length;
check(goalsFromShots === r.match.score[0] + r.match.score[1], 'nb de buts dans la shot map = score total (' + goalsFromShots + ')');

var starters = r.players.filter(function (p) { return p.started; });
check(starters.length === 22, '22 titulaires detectes (' + starters.length + ')');

var over = r.players.filter(function (p) { return p.minutes > r.match.minutes + 1; });
check(over.length === 0, 'aucun joueur avec plus de minutes que le match');

var neg = r.players.filter(function (p) { return p.minutes < 0 || p.passes < 0; });
check(neg.length === 0, 'aucune valeur negative');

var accBad = r.players.filter(function (p) { return p.passAcc > 100.001; });
check(accBad.length === 0, 'aucune precision de passe > 100%');

var sumPassesA = r.players.filter(function (p) { return p.team === A; })
  .reduce(function (s, p) { return s + p.passes; }, 0);
check(sumPassesA === ta.passes, 'somme des passes joueurs = total equipe (' + sumPassesA + ' vs ' + ta.passes + ')');

var sumXgA = r.players.filter(function (p) { return p.team === A; })
  .reduce(function (s, p) { return s + p.xg; }, 0);
check(Math.abs(sumXgA - ta.xg) < 0.001, 'somme xG joueurs = xG equipe');

var lastRace = r.xgRace[r.xgRace.length - 1];
check(Math.abs(lastRace.a - ta.xg) < 0.001 && Math.abs(lastRace.b - tb.xg) < 0.001, 'fin de courbe xG = xG total');

// Un tir cadre finit soit au fond, soit dans les gants du gardien adverse.
check(ta.shotsOnTarget === ta.goals - ta.ownGoals + tb.saves,
  'tirs cadres ' + A + ' = buts + arrets de ' + B + ' (' + ta.shotsOnTarget + ' = ' + (ta.goals - ta.ownGoals) + ' + ' + tb.saves + ')');
check(tb.shotsOnTarget === tb.goals - tb.ownGoals + ta.saves,
  'tirs cadres ' + B + ' = buts + arrets de ' + A + ' (' + tb.shotsOnTarget + ' = ' + (tb.goals - tb.ownGoals) + ' + ' + ta.saves + ')');
check(ta.saves + tb.saves > 0, 'arrets de gardien detectes (cle JSON "goalkeeper")');
check(ta.aerialsWon + tb.aerialsWon > 0, 'duels aeriens gagnes detectes (drapeau aerial_won)');
check(ta.aerialsWon === tb.aerialsLost && tb.aerialsWon === ta.aerialsLost,
  'chaque duel aerien gagne par un camp est perdu par l autre (' +
  ta.aerialsWon + '/' + tb.aerialsLost + ' et ' + tb.aerialsWon + '/' + ta.aerialsLost + ')');

check(r.network[A].nodes.length >= 10, 'reseau de passes ' + A + ' : ' + r.network[A].nodes.length + ' noeuds');
check(r.network[B].nodes.length >= 10, 'reseau de passes ' + B + ' : ' + r.network[B].nodes.length + ' noeuds');

console.log('\n--- top 8 joueurs par minutes ---');
console.log('joueur'.padEnd(24) + 'equipe'.padEnd(10) + 'min'.padStart(5) + 'tou'.padStart(5) + 'pas'.padStart(5) + '%'.padStart(6) + 'xG'.padStart(6) + 'xA'.padStart(6) + 'duel'.padStart(6));
r.players.slice(0, 8).forEach(function (p) {
  console.log(
    (p.name || '?').slice(0, 23).padEnd(24) +
    p.team.slice(0, 9).padEnd(10) +
    String(p.minutes).padStart(5) +
    String(p.touches).padStart(5) +
    String(p.passes).padStart(5) +
    n(p.passAcc, 0).padStart(6) +
    n(p.xg, 2).padStart(6) +
    n(p.xa, 2).padStart(6) +
    (p.duelsWon + '/' + p.duels).padStart(6));
});

console.log('\n--- top 5 passes progressives ---');
r.players.slice().sort(function (a, b) { return b.progressivePasses - a.progressivePasses; })
  .slice(0, 5).forEach(function (p) {
    console.log('  ' + (p.name || '?').slice(0, 22).padEnd(23) + (p.position || '').slice(0, 22).padEnd(23) +
      String(p.progressivePasses).padStart(3));
  });
var gkProg = r.players.filter(function (p) { return p.position === 'Goalkeeper'; })
  .reduce(function (s, p) { return s + p.progressivePasses; }, 0);
check(gkProg === 0, 'les gardiens ne comptent aucune passe progressive (' + gkProg + ')');

console.log('\n--- buteurs ---');
r.shots.filter(function (s) { return s.goal; }).forEach(function (s) {
  console.log('  ' + String(s.minute).padStart(3) + "'  " + (s.player || '?').padEnd(22) + s.team.padEnd(10) + 'xG ' + n(s.xg, 2));
});

console.log('\n' + (errs.length ? errs.length + ' CONTROLE(S) EN ECHEC' : 'tous les controles passent'));
process.exit(errs.length ? 1 : 0);
