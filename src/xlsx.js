/* ============================================================================
   Lecteur xlsx - aucune dependance, navigateur et node.

   Un .xlsx est une archive ZIP de fichiers XML. Deux briques suffisent donc :
   ouvrir le ZIP, puis lire deux XML (les chaines partagees, et la feuille).

   La decompression passe par DecompressionStream('deflate-raw'), presente
   dans tous les navigateurs modernes et dans node. C'est ce qui permet de
   rester sans librairie : pas de SheetJS, rien a charger, la page continue de
   fonctionner hors ligne et depuis un fichier local.

   Le XML est lu au balayage plutot qu'avec DOMParser : ces deux fichiers-la
   sont generes par une machine et parfaitement reguliers, et un balayage
   tourne aussi en node, ou DOMParser n'existe pas. C'est ce qui rend le
   lecteur testable hors du navigateur.
   ========================================================================== */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------- ZIP */

  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) {
    return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216;
  }

  var SIG_EOCD = 0x06054b50;
  var SIG_CEN = 0x02014b50;

  // Le catalogue est en fin d'archive, apres un commentaire de taille libre :
  // on remonte depuis la fin jusqu'a tomber sur sa signature.
  function findEOCD(b) {
    var min = Math.max(0, b.length - 65557);
    for (var i = b.length - 22; i >= min; i--) {
      if (u32(b, i) === SIG_EOCD) return i;
    }
    return -1;
  }

  function inflate(bytes, method) {
    if (method === 0) return Promise.resolve(bytes);      // stocke tel quel
    if (method !== 8) {
      return Promise.reject(new Error('compression ZIP non geree (methode ' + method + ').'));
    }
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error(
        'Ce navigateur ne sait pas décompresser un .xlsx (DecompressionStream absent). ' +
        'Enregistrez la feuille en .csv, ou utilisez un navigateur plus récent.'));
    }
    var ds = new DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter();
    w.write(bytes);
    w.close();
    return new Response(ds.readable).arrayBuffer().then(function (ab) {
      return new Uint8Array(ab);
    });
  }

  // Rend un objet { nom: Uint8Array } pour les seules entrees demandees.
  function unzip(buffer, wanted) {
    var b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var eocd = findEOCD(b);
    if (eocd < 0) throw new Error('Ce fichier n’est pas une archive ZIP valide (donc pas un .xlsx).');

    var count = u16(b, eocd + 10);
    var start = u32(b, eocd + 16);
    if (start === 0xffffffff || count === 0xffff) {
      throw new Error('Archive ZIP64 : fichier trop volumineux pour ce lecteur.');
    }

    var jobs = [];
    var p = start;
    for (var i = 0; i < count; i++) {
      if (u32(b, p) !== SIG_CEN) throw new Error('Catalogue ZIP illisible à l’entrée ' + i + '.');
      var method = u16(b, p + 10);
      var csize = u32(b, p + 20);
      var nameLen = u16(b, p + 28);
      var extraLen = u16(b, p + 30);
      var commentLen = u16(b, p + 32);
      var local = u32(b, p + 42);
      var name = '';
      for (var k = 0; k < nameLen; k++) name += String.fromCharCode(b[p + 46 + k]);
      p += 46 + nameLen + extraLen + commentLen;

      if (wanted && wanted.indexOf(name) === -1) continue;

      // L'en-tete local redit les longueurs de nom et d'extra, et ce sont
      // celles-la qui font foi pour trouver le debut des donnees : le champ
      // extra local differe souvent de celui du catalogue.
      var lnameLen = u16(b, local + 26);
      var lextraLen = u16(b, local + 28);
      var from = local + 30 + lnameLen + lextraLen;
      jobs.push({ name: name, bytes: b.subarray(from, from + csize), method: method });
    }

    return Promise.all(jobs.map(function (j) {
      return inflate(j.bytes, j.method).then(function (out) { return { name: j.name, data: out }; });
    })).then(function (list) {
      var out = {};
      list.forEach(function (e) { out[e.name] = e.data; });
      return out;
    });
  }

  /* ------------------------------------------------------------------- XML */

  function utf8(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(s));
  }

  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'' };
  function unesc(s) {
    if (s.indexOf('&') === -1) return s;
    return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, function (m, e) {
      if (e.charAt(0) === '#') {
        var n = e.charAt(1) === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isNaN(n) ? m : String.fromCharCode(n);
      }
      return ENT[e] != null ? ENT[e] : m;
    });
  }

  // Concatene le texte de toutes les balises <t> d'un fragment. Une chaine
  // peut etre decoupee en plusieurs <t> quand elle porte plusieurs styles.
  function textOf(frag) {
    var out = '';
    var re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s[^>]*\/>/g;
    var m;
    while ((m = re.exec(frag))) out += m[1] == null ? '' : unesc(m[1]);
    return out;
  }

  function sharedStrings(xml) {
    var out = [];
    var re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>|<si\s*\/>/g;
    var m;
    while ((m = re.exec(xml))) out.push(m[1] == null ? '' : textOf(m[1]));
    return out;
  }

  // "BC" -> 54. Les feuilles InStat depassent la colonne Z.
  function colIndex(ref) {
    var n = 0;
    for (var i = 0; i < ref.length; i++) {
      var c = ref.charCodeAt(i);
      if (c < 65 || c > 90) break;
      n = n * 26 + (c - 64);
    }
    return n - 1;
  }

  function sheetRows(xml, shared) {
    var rows = [];
    var rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>|<row\s[^>]*\/>/g;
    var cellRe = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    var rm;
    while ((rm = rowRe.exec(xml))) {
      var body = rm[1] || '';
      var cells = {};
      var width = 0;
      var cm;
      cellRe.lastIndex = 0;
      while ((cm = cellRe.exec(body))) {
        var attrs = cm[1] || '';
        var inner = cm[2] || '';
        var rref = /r="([A-Z]+)/.exec(attrs);
        if (!rref) continue;
        var idx = colIndex(rref[1]);
        var type = /t="([^"]+)"/.exec(attrs);
        type = type ? type[1] : 'n';
        var val;
        if (type === 's') {
          var v = /<v>([\s\S]*?)<\/v>/.exec(inner);
          var si = v ? parseInt(v[1], 10) : -1;
          val = shared[si] == null ? '' : shared[si];
        } else if (type === 'inlineStr') {
          val = textOf(inner);
        } else {
          var vn = /<v>([\s\S]*?)<\/v>/.exec(inner);
          val = vn ? unesc(vn[1]) : '';
        }
        cells[idx] = val;
        if (idx + 1 > width) width = idx + 1;
      }
      var arr = [];
      for (var i = 0; i < width; i++) arr.push(cells[i] == null ? '' : cells[i]);
      rows.push(arr);
    }
    return rows;
  }

  /* ---------------------------------------------------------------- entree */

  // Rend un tableau de lignes, chaque ligne un tableau de chaines.
  // Seule la premiere feuille est lue : les exports InStat n'en ont qu'une.
  function readXlsx(buffer) {
    var wanted = ['xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml'];
    return Promise.resolve()
      .then(function () { return unzip(buffer, wanted); })
      .then(function (files) {
        if (!files['xl/worksheets/sheet1.xml']) {
          throw new Error('Classeur sans feuille lisible (xl/worksheets/sheet1.xml absent).');
        }
        var shared = files['xl/sharedStrings.xml']
          ? sharedStrings(utf8(files['xl/sharedStrings.xml'])) : [];
        return sheetRows(utf8(files['xl/worksheets/sheet1.xml']), shared);
      });
  }

  // Excel compte les jours depuis le 30/12/1899. La fraction est l'heure.
  function excelDate(serial) {
    var n = parseFloat(serial);
    if (!isFinite(n)) return null;
    return new Date(Math.round((n - 25569) * 86400000));
  }

  root.KMRXlsx = { read: readXlsx, excelDate: excelDate, unzip: unzip };
})(typeof module !== 'undefined' && module.exports ? module.exports : (typeof window !== 'undefined' ? window : this));
