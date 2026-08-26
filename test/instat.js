/* Controles de l'import InStat / Hudl.

   Deux choses a garder honnetes, et aucune des deux ne peut l'etre par
   accident :

   1. Les intitules de colonnes. `app.js` cite plus de quatre-vingts
      intitules anglais recopies a la main ("Ball recoveries after losses
      within 5 seconds"...). Une faute de frappe ne casse rien : la mesure
      s'affiche simplement vide, pour toujours. On confronte donc chaque `k`
      au schema releve sur un vrai export (fixtures/instat-headers.json -
      des noms de colonnes seulement, aucune donnee de club).

   2. La lecture du score. InStat ecrit "Score" en DOMICILE:EXTERIEUR. Sur les
      matchs a l'exterieur, la lire naivement inverse le resultat. Le classeur
      d'exemple contient exprès un match a l'exterieur au score asymetrique :
      si quelqu'un "simplifie" un jour le moteur en lisant Score, ce controle
      tombe.                                                                  */
var fs = require('fs');
var path = require('path');

var K = require(path.join(__dirname, '..', 'src', 'engine.js')).KMR;
var X = require(path.join(__dirname, '..', 'src', 'xlsx.js')).KMRXlsx;

var fail = 0;
function ok(cond, msg) {
  if (cond) console.log('  OK     ' + msg);
  else { console.error('  ECHEC  ' + msg); fail++; }
}

/* ---------------------------------------- 1. les intitules cites existent */

var schema = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'instat-headers.json'), 'utf8'));

var appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

function block(startMark, endMark) {
  var a = appSrc.indexOf(startMark);
  var b = appSrc.indexOf(endMark, a);
  if (a < 0 || b < 0) {
    console.error('  ECHEC  bloc introuvable dans app.js : ' + startMark);
    fail++;
    return '';
  }
  return appSrc.slice(a, b);
}

// Les intitules sont cites entre apostrophes, avec \' pour les apostrophes
// anglaises ("opponent's box"). On relit exactement ce que verra le moteur.
function quoted(src, re) {
  var out = [], m;
  while ((m = re.exec(src))) out.push(m[1].replace(/\\'/g, "'"));
  return out;
}

var groupsSrc = block('var INSTAT_GROUPS = [', 'var INSTAT_COLS');
var colsSrc = block('var INSTAT_COLS = {', 'var INSTAT_NO_PER90');

var gKeys = quoted(groupsSrc, /\{ k: '((?:[^'\\]|\\.)*)'/g);
var cKeys = quoted(colsSrc, /\['((?:[^'\\]|\\.)*)',/g);

console.log('mesures citees : %d dans INSTAT_GROUPS, %d dans INSTAT_COLS', gKeys.length, cKeys.length);
ok(gKeys.length >= 60, 'INSTAT_GROUPS cite au moins 60 mesures (' + gKeys.length + ')');
ok(cKeys.length >= 30, 'INSTAT_COLS cite au moins 30 colonnes (' + cKeys.length + ')');

var missM = gKeys.filter(function (k) { return schema.match.indexOf(k) === -1; });
var missP = cKeys.filter(function (k) { return schema.player.indexOf(k) === -1; });
ok(!missM.length, 'toutes les mesures du comparatif existent dans l\'export match' +
  (missM.length ? ' -- absentes : ' + missM.join(' | ') : ''));
ok(!missP.length, 'toutes les colonnes joueur existent dans l\'export joueur' +
  (missP.length ? ' -- absentes : ' + missP.join(' | ') : ''));

// Chaque mesure du comparatif doit declarer sa direction du merite.
var rowsSrc = groupsSrc.match(/\{ k: '(?:[^'\\]|\\.)*'[^\n]*\}/g) || [];
var noDir = rowsSrc.filter(function (r) { return !/\bdir: -?\d/.test(r); });
ok(!noDir.length, 'chaque mesure InStat declare sa direction du merite' +
  (noDir.length ? ' -- ' + noDir.length + ' sans dir' : ''));

var dirs = { '1': 0, '-1': 0, '0': 0 };
rowsSrc.forEach(function (r) {
  var m = /\bdir: (-?\d)/.exec(r);
  if (m) dirs[m[1]]++;
});
ok(dirs['0'] > 0 && dirs['1'] > 0 && dirs['-1'] > 0,
  'les trois directions restent peuplees : haut ' + dirs['1'] +
  ', bas ' + dirs['-1'] + ', sans jugement ' + dirs['0']);

/* ------------------------------------- 2. le classeur d'exemple se lit bien */

var sample = path.join(__dirname, 'fixtures', 'instat-sample.xlsx');

X.read(new Uint8Array(fs.readFileSync(sample))).then(function (rows) {
  ok(rows.length > 1, 'le classeur d\'exemple se decompresse et se lit (' + rows.length + ' lignes)');

  var d = K.analyseInstatMatches(rows);
  ok(d.matches.length === 2, 'deux matchs lus (' + d.matches.length + ')');

  var dom = d.matches.filter(function (m) { return m.home; })[0];
  var ext = d.matches.filter(function (m) { return !m.home; })[0];

  ok(dom && dom.gf === 3 && dom.ga === 1 && dom.result === 'V',
    'match a domicile : 3-1, victoire');

  // Le coeur du controle : au classeur, ce match porte Score "2:0" - domicile
  // d'abord. Notre equipe joue a l'exterieur et a donc PERDU 0-2. Lire Score
  // de gauche a droite en ferait une victoire.
  ok(ext && ext.gf === 0 && ext.ga === 2 && ext.result === 'D',
    'match a l\'exterieur : Score "2:0" se lit domicile:exterieur, donc defaite 0-2');

  ok(d.record.V === 1 && d.record.N === 0 && d.record.D === 1 && d.points === 3,
    'bilan 1V 0N 1D, 3 points');
  ok(d.scoreColumnSuspect === false, 'le controle croise sur Score ne signale rien');

  // Conversions du format.
  ok(dom.us['Ball possession, %'] === 61, 'un pourcentage stocke 0.61 devient 61');
  ok(Math.abs(dom.us['Ball possession, min.'] - 27.5) < 1e-9,
    'une duree "27:30" devient 27,5 minutes');
  ok(dom.formation === '4-2-3-1', 'le dispositif reste une chaine (4-2-3-1, pas 4)');
  ok(dom.us['Red cards'] === null, 'une case "-" devient null, pas zero');
  ok(dom.date instanceof Date && dom.date.getUTCFullYear() === 2026,
    'la date serie Excel redevient une date');

  if (fail) {
    console.error('\n%d controle(s) en echec', fail);
    process.exit(1);
  }
  console.log('\ntous les controles InStat passent');
}).catch(function (e) {
  console.error('ECHEC : ' + e.message);
  console.error(e.stack);
  process.exit(1);
});
