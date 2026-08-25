/* Verifie que chaque mesure du comparatif declare une direction du merite.

   Le risque n'est pas theorique : `dir` est optionnel cote code (absent = 1,
   "haut = mieux"). Ajouter une mesure de volume - degagements, centres,
   arrets - sans la classer la ferait donc juger dans le bon sens par defaut,
   et le rapport dirait a un staff que subir, c'est bien faire. Ce controle
   force le choix a etre explicite, mesure par mesure.

   On lit le source plutot que de l'executer : app.js a besoin d'un DOM.      */
var fs = require('fs');
var path = require('path');

var src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

var start = src.indexOf('var GROUPS = [');
var end = src.indexOf('function teamVal');
if (start < 0 || end < 0 || end < start) {
  console.error('GROUPS introuvable dans src/app.js — le controle ne verifie plus rien.');
  process.exit(1);
}
var block = src.slice(start, end);

var rows = block.match(/\{ k: '[^']+'[^\n]*\}/g) || [];
if (rows.length < 30) {
  console.error('seulement ' + rows.length + ' mesures reperees : le decoupage a derive.');
  process.exit(1);
}

var missing = [];
var counts = { '1': 0, '-1': 0, '0': 0 };
rows.forEach(function (r) {
  var k = /k: '([^']+)'/.exec(r)[1];
  var m = /\bdir: (-?\d)/.exec(r);
  if (!m) { missing.push(k); return; }
  counts[m[1]]++;
});

if (missing.length) {
  console.error('mesures sans direction du merite : ' + missing.join(', '));
  console.error('ajoutez dir: 1 (haut = mieux), dir: -1 (bas = mieux) ou dir: 0 (sans jugement).');
  process.exit(1);
}

// Les trois cas doivent rester peuples : si le neutre disparait, c'est que
// quelqu'un a decide que tout se jugeait, ce qui est le defaut qu'on corrige.
if (!counts['1'] || !counts['-1'] || !counts['0']) {
  console.error('une des trois directions est vide : ' + JSON.stringify(counts));
  process.exit(1);
}

console.log('les ' + rows.length + ' mesures declarent leur direction du merite');
console.log('  haut = mieux : ' + counts['1'] +
            '   bas = mieux : ' + counts['-1'] +
            '   sans jugement : ' + counts['0']);
