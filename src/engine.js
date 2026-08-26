/* ============================================================================
   Kazma Match Report - moteur d'analyse
   Ne depend d'aucune librairie. Tourne dans le navigateur ET dans node.
   ========================================================================== */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- terrain */
  var PITCH_X = 120, PITCH_Y = 80;
  var GOAL = [120, 40];

  function distToGoal(loc) {
    if (!loc) return null;
    var dx = GOAL[0] - loc[0], dy = GOAL[1] - loc[1];
    return Math.sqrt(dx * dx + dy * dy);
  }
  function inBox(loc) {
    return !!loc && loc[0] >= 102 && loc[1] >= 18 && loc[1] <= 62;
  }
  function inFinalThird(loc) { return !!loc && loc[0] >= 80; }

  // Progressif, definition FBref : action terminee qui rapproche le ballon
  // d'au moins 10 m du but adverse, en excluant celles parties des 40%
  // defensifs. Sans cette exclusion, les degagements du gardien trustent le
  // classement (ils partent de 115 m du but, donc tout gain relatif est enorme)
  // et les attaquants, deja proches, n'y figurent jamais.
  var OWN_40 = 48;
  function isProgressive(from, to) {
    if (!from || !to) return false;
    if (from[0] < OWN_40) return false;
    var d0 = distToGoal(from), d1 = distToGoal(to);
    if (d0 == null || d1 == null) return false;
    return (d0 - d1) >= 10;
  }

  /* ------------------------------------------------------------- utilitaires */
  function nm(o) { return o && o.name ? o.name : null; }
  function t0(ev) { return (ev.minute || 0) * 60 + (ev.second || 0); }

  var ON_TARGET = { 'Goal': 1, 'Saved': 1, 'Saved to Post': 1, 'Saved To Post': 1 };
  var SET_PIECE_PASS = { 'Corner': 1, 'Free Kick': 1, 'Throw-in': 1, 'Kick Off': 1, 'Goal Kick': 1 };
  var DUEL_WON = { 'Won': 1, 'Success': 1, 'Success In Play': 1, 'Success Out': 1 };
  var GK_SAVE = { 'Shot Saved': 1, 'Penalty Saved': 1, 'Smother': 1, 'Saved to Post': 1, 'Shot Saved to Post': 1 };

  // Le drapeau aerial_won est pose sur le sous-objet de l'action (pass, clearance,
  // shot, miscontrol...). On balaie les sous-objets plutot que de tous les nommer.
  function hasAerialWon(ev) {
    for (var k in ev) {
      var v = ev[k];
      if (v && typeof v === 'object' && v.aerial_won === true) return true;
    }
    return false;
  }

  function blankTeam() {
    return {
      possession: 0, possessionSeconds: 0,
      goals: 0, ownGoals: 0, shots: 0, shotsOnTarget: 0, shotsInBox: 0, xg: 0,
      passes: 0, passesCompleted: 0, passAcc: 0,
      openPlayPasses: 0, longPasses: 0, crosses: 0,
      finalThirdPasses: 0, passesIntoBox: 0, progressivePasses: 0,
      keyPasses: 0, assists: 0, xa: 0,
      carries: 0, progressiveCarries: 0, carryDistance: 0,
      dribbles: 0, dribblesCompleted: 0,
      touchesInBox: 0,
      duels: 0, duelsWon: 0, aerials: 0, aerialsWon: 0, aerialsLost: 0, tackles: 0,
      pressures: 0, counterpressures: 0,
      recoveries: 0, interceptions: 0, clearances: 0, blocks: 0,
      turnovers: 0, dispossessed: 0, miscontrols: 0,
      foulsCommitted: 0, foulsWon: 0, offsides: 0,
      corners: 0, throwIns: 0, freeKicks: 0,
      yellowCards: 0, redCards: 0,
      saves: 0, goalsConceded: 0,
      ppda: null, fieldTilt: 0,
      formation: null
    };
  }

  function blankPlayer(name, team) {
    return {
      name: name, team: team, position: null, jersey: null, minutes: 0,
      touches: 0,
      passes: 0, passesCompleted: 0, passAcc: 0, keyPasses: 0, assists: 0, xa: 0,
      finalThirdPasses: 0, passesIntoBox: 0, progressivePasses: 0, crosses: 0,
      shots: 0, shotsOnTarget: 0, goals: 0, xg: 0,
      carries: 0, progressiveCarries: 0, carryDistance: 0,
      dribbles: 0, dribblesCompleted: 0, touchesInBox: 0,
      duels: 0, duelsWon: 0, aerials: 0, aerialsWon: 0, aerialsLost: 0, tackles: 0,
      pressures: 0, recoveries: 0, interceptions: 0, clearances: 0, blocks: 0,
      turnovers: 0, dispossessed: 0, miscontrols: 0,
      foulsCommitted: 0, foulsWon: 0, offsides: 0,
      yellowCards: 0, redCards: 0, saves: 0, goalsConceded: 0,
      subbedOn: null, subbedOff: null, started: false
    };
  }

  /* ================================================== parseur StatsBomb events */
  function analyseStatsBomb(events, lineups) {
    var i, ev, e;

    // Les tirs au but (periode 5) ne comptent dans aucune statistique.
    var live = [];
    for (i = 0; i < events.length; i++) {
      if (events[i] && events[i].period !== 5) live.push(events[i]);
    }
    if (!live.length) throw new Error('Aucun événement exploitable dans ce fichier.');

    /* --- identification des deux equipes ---------------------------------- */
    var order = [];
    for (i = 0; i < live.length; i++) {
      var tn = nm(live[i].team);
      if (tn && order.indexOf(tn) === -1) order.push(tn);
    }
    if (order.length < 2) throw new Error('Un seul club trouvé dans le fichier : impossible de comparer.');
    var TEAMS = [order[0], order[1]];

    var teams = {}, players = {};
    teams[TEAMS[0]] = blankTeam();
    teams[TEAMS[1]] = blankTeam();

    function P(name, team) {
      if (!players[name]) players[name] = blankPlayer(name, team);
      return players[name];
    }
    function other(team) { return team === TEAMS[0] ? TEAMS[1] : TEAMS[0]; }

    var lastMinute = 0;
    for (i = 0; i < live.length; i++) if (live[i].minute > lastMinute) lastMinute = live[i].minute;
    var matchMinutes = lastMinute;

    /* --- passe decisive de tir : id de passe -> xG du tir ------------------ */
    var xaByPass = {};
    for (i = 0; i < live.length; i++) {
      ev = live[i];
      if (nm(ev.type) === 'Shot' && ev.shot && ev.shot.key_pass_id) {
        xaByPass[ev.shot.key_pass_id] = ev.shot.statsbomb_xg || 0;
      }
    }

    /* --- possession par chaine (possession_team + duree reelle) ------------ */
    var chains = {};
    for (i = 0; i < live.length; i++) {
      ev = live[i];
      var pid = ev.possession;
      if (pid == null) continue;
      var c = chains[pid];
      var t = t0(ev);
      if (!c) {
        chains[pid] = { team: nm(ev.possession_team), start: t, end: t + (ev.duration || 0) };
      } else {
        if (t < c.start) c.start = t;
        if (t + (ev.duration || 0) > c.end) c.end = t + (ev.duration || 0);
      }
    }
    for (var k in chains) {
      var ch = chains[k];
      if (!ch.team || !teams[ch.team]) continue;
      var d = ch.end - ch.start;
      if (d > 0 && d < 300) teams[ch.team].possessionSeconds += d;
    }
    var totalPoss = teams[TEAMS[0]].possessionSeconds + teams[TEAMS[1]].possessionSeconds;
    if (totalPoss > 0) {
      teams[TEAMS[0]].possession = teams[TEAMS[0]].possessionSeconds / totalPoss * 100;
      teams[TEAMS[1]].possession = 100 - teams[TEAMS[0]].possession;
    }

    /* --- PPDA : compteurs intermediaires ---------------------------------- */
    var buildupPasses = {}, defActions = {};
    buildupPasses[TEAMS[0]] = 0; buildupPasses[TEAMS[1]] = 0;
    defActions[TEAMS[0]] = 0; defActions[TEAMS[1]] = 0;

    var shots = [];
    var passList = [];

    var TOUCH = {
      'Pass': 1, 'Ball Receipt*': 1, 'Carry': 1, 'Shot': 1, 'Dribble': 1,
      'Clearance': 1, 'Miscontrol': 1, 'Interception': 1, 'Ball Recovery': 1, 'Goal Keeper': 1
    };

    /* --- boucle principale ------------------------------------------------ */
    for (i = 0; i < live.length; i++) {
      ev = live[i];
      var team = nm(ev.team);
      if (!team || !teams[team]) continue;
      var T = teams[team];
      var type = nm(ev.type);
      var pname = nm(ev.player);
      var pl = pname ? P(pname, team) : null;
      if (pl && !pl.position && ev.position) pl.position = nm(ev.position);
      var loc = ev.location;

      // compos de depart : formation + titulaires
      if (type === 'Starting XI') {
        if (ev.tactics) {
          T.formation = ev.tactics.formation != null ? String(ev.tactics.formation) : null;
          var xi = (ev.tactics.lineup || []);
          for (var s = 0; s < xi.length; s++) {
            var sp = P(nm(xi[s].player), team);
            sp.started = true;
            sp.subbedOn = 0;
            sp.position = nm(xi[s].position) || sp.position;
            sp.jersey = xi[s].jersey_number != null ? xi[s].jersey_number : sp.jersey;
          }
        }
        continue;
      }

      if (type === 'Substitution') {
        if (pl) pl.subbedOff = ev.minute;
        if (ev.substitution && ev.substitution.replacement) {
          var inp = P(nm(ev.substitution.replacement), team);
          inp.subbedOn = ev.minute;
        }
        continue;
      }

      // touches : tout evenement avec ballon au pied
      if (pl && TOUCH[type]) {
        pl.touches++;
        if (inBox(loc) && type !== 'Ball Receipt*') { pl.touchesInBox++; T.touchesInBox++; }
      }

      // Duel aerien gagne : StatsBomb ne cree pas d'evenement Duel pour le gagnant,
      // il pose un drapeau aerial_won sur l'action qui suit (passe, degagement, tir...).
      if (hasAerialWon(ev)) {
        T.aerialsWon++; T.aerials++;
        if (pl) { pl.aerialsWon++; pl.aerials++; }
      }

      switch (type) {

        case 'Pass':
          e = ev.pass || {};
          var complete = !e.outcome;
          var setPiece = SET_PIECE_PASS[nm(e.type)] ? true : false;
          T.passes++; if (pl) pl.passes++;
          if (complete) { T.passesCompleted++; if (pl) pl.passesCompleted++; }
          if (!setPiece) T.openPlayPasses++;
          if (e.length > 32) T.longPasses++;
          if (e.cross) { T.crosses++; if (pl) pl.crosses++; }
          if (nm(e.type) === 'Corner') T.corners++;
          if (nm(e.type) === 'Throw-in') T.throwIns++;
          if (nm(e.type) === 'Free Kick') T.freeKicks++;
          if (nm(e.outcome) === 'Pass Offside') { T.offsides++; if (pl) pl.offsides++; }

          if (complete && inFinalThird(e.end_location)) {
            T.finalThirdPasses++; if (pl) pl.finalThirdPasses++;
          }
          if (complete && inBox(e.end_location) && !inBox(loc)) {
            T.passesIntoBox++; if (pl) pl.passesIntoBox++;
          }
          if (complete && isProgressive(loc, e.end_location)) {
            T.progressivePasses++; if (pl) pl.progressivePasses++;
          }
          if (e.shot_assist) { T.keyPasses++; if (pl) pl.keyPasses++; }
          if (e.goal_assist) { T.assists++; if (pl) pl.assists++; }
          if (ev.id && xaByPass[ev.id] != null) {
            T.xa += xaByPass[ev.id];
            if (pl) pl.xa += xaByPass[ev.id];
          }
          // PPDA : passes de cette equipe dans ses 60% defensifs
          if (loc && loc[0] <= 72) buildupPasses[team]++;

          passList.push({
            team: team, player: pname, minute: ev.minute,
            from: loc, to: e.end_location, complete: complete,
            recipient: nm(e.recipient), setPiece: setPiece
          });
          break;

        case 'Shot':
          e = ev.shot || {};
          var out = nm(e.outcome);
          var xg = e.statsbomb_xg || 0;
          T.shots++; T.xg += xg;
          if (pl) { pl.shots++; pl.xg += xg; }
          if (ON_TARGET[out]) { T.shotsOnTarget++; if (pl) pl.shotsOnTarget++; }
          if (inBox(loc)) T.shotsInBox++;
          if (out === 'Goal') { T.goals++; if (pl) pl.goals++; }
          shots.push({
            team: team, player: pname, minute: ev.minute, second: ev.second || 0,
            x: loc ? loc[0] : null, y: loc ? loc[1] : null,
            xg: xg, outcome: out, goal: out === 'Goal',
            bodyPart: nm(e.body_part), shotType: nm(e.type)
          });
          break;

        case 'Own Goal For':
          T.goals++; T.ownGoals++;
          shots.push({
            team: team, player: 'csc', minute: ev.minute, second: ev.second || 0,
            x: null, y: null, xg: 0, outcome: 'Own Goal', goal: true, ownGoal: true
          });
          break;

        case 'Carry':
          e = ev.carry || {};
          T.carries++; if (pl) pl.carries++;
          if (loc && e.end_location) {
            var cd = Math.sqrt(Math.pow(e.end_location[0] - loc[0], 2) + Math.pow(e.end_location[1] - loc[1], 2));
            T.carryDistance += cd; if (pl) pl.carryDistance += cd;
            if (isProgressive(loc, e.end_location)) {
              T.progressiveCarries++; if (pl) pl.progressiveCarries++;
            }
          }
          break;

        case 'Dribble':
          e = ev.dribble || {};
          T.dribbles++; if (pl) pl.dribbles++;
          if (nm(e.outcome) === 'Complete') { T.dribblesCompleted++; if (pl) pl.dribblesCompleted++; }
          break;

        case 'Duel':
          e = ev.duel || {};
          var dtype = nm(e.type), dout = nm(e.outcome);
          T.duels++; if (pl) pl.duels++;
          if (DUEL_WON[dout]) { T.duelsWon++; if (pl) pl.duelsWon++; }
          if (dtype === 'Aerial Lost') {
            T.aerials++; T.aerialsLost++;
            if (pl) { pl.aerials++; pl.aerialsLost++; }
          }
          if (dtype === 'Tackle') {
            T.tackles++; if (pl) pl.tackles++;
            if (loc && loc[0] >= 48) defActions[team]++;
          }
          break;

        case 'Pressure':
          T.pressures++; if (pl) pl.pressures++;
          if (ev.counterpress) T.counterpressures++;
          break;

        case 'Ball Recovery':
          T.recoveries++; if (pl) pl.recoveries++;
          break;

        case 'Interception':
          T.interceptions++; if (pl) pl.interceptions++;
          if (loc && loc[0] >= 48) defActions[team]++;
          break;

        case 'Clearance':
          T.clearances++; if (pl) pl.clearances++;
          break;

        case 'Block':
          T.blocks++; if (pl) pl.blocks++;
          break;

        case 'Dispossessed':
          T.dispossessed++; T.turnovers++;
          if (pl) { pl.dispossessed++; pl.turnovers++; }
          break;

        case 'Miscontrol':
          T.miscontrols++; T.turnovers++;
          if (pl) { pl.miscontrols++; pl.turnovers++; }
          break;

        case 'Foul Committed':
          e = ev.foul_committed || {};
          T.foulsCommitted++; if (pl) pl.foulsCommitted++;
          if (loc && loc[0] >= 48) defActions[team]++;
          var card = nm(e.card);
          if (card === 'Yellow Card') { T.yellowCards++; if (pl) pl.yellowCards++; }
          if (card === 'Red Card' || card === 'Second Yellow') { T.redCards++; if (pl) pl.redCards++; }
          break;

        case 'Foul Won':
          T.foulsWon++; if (pl) pl.foulsWon++;
          break;

        case 'Bad Behaviour':
          var bcard = ev.bad_behaviour ? nm(ev.bad_behaviour.card) : null;
          if (bcard === 'Yellow Card') { T.yellowCards++; if (pl) pl.yellowCards++; }
          if (bcard === 'Red Card' || bcard === 'Second Yellow') { T.redCards++; if (pl) pl.redCards++; }
          break;

        case 'Goal Keeper':
          // Attention : la cle JSON est "goalkeeper" en un mot, pas "goal_keeper".
          e = ev.goalkeeper || ev.goal_keeper || {};
          var gkType = nm(e.type);
          if (GK_SAVE[gkType]) { T.saves++; if (pl) pl.saves++; }
          if (gkType === 'Goal Conceded') { T.goalsConceded++; if (pl) pl.goalsConceded++; }
          break;

        case 'Offside':
          T.offsides++; if (pl) pl.offsides++;
          break;
      }
    }

    /* --- PPDA + field tilt ------------------------------------------------ */
    for (var ti = 0; ti < 2; ti++) {
      var tn2 = TEAMS[ti], op = other(tn2);
      var da = defActions[tn2];
      teams[tn2].ppda = da > 0 ? buildupPasses[op] / da : null;
      var mine = teams[tn2].finalThirdPasses, his = teams[op].finalThirdPasses;
      teams[tn2].fieldTilt = (mine + his) > 0 ? mine / (mine + his) * 100 : 50;
      teams[tn2].passAcc = teams[tn2].passes ? teams[tn2].passesCompleted / teams[tn2].passes * 100 : 0;
    }

    /* --- temps de jeu ------------------------------------------------------ */
    var plist = [];
    for (var pn in players) {
      var pp = players[pn];
      var on = pp.subbedOn == null ? 0 : pp.subbedOn;
      var off = pp.subbedOff == null ? matchMinutes : pp.subbedOff;
      pp.minutes = Math.max(0, off - on);
      pp.passAcc = pp.passes ? pp.passesCompleted / pp.passes * 100 : 0;
      plist.push(pp);
    }

    /* --- enrichissement via le fichier de compositions --------------------- */
    if (lineups && lineups.length) {
      for (var li = 0; li < lineups.length; li++) {
        var arr = lineups[li].lineup || [];
        for (var lj = 0; lj < arr.length; lj++) {
          var rec = arr[lj];
          var target = players[rec.player_name] || players[rec.player_nickname];
          if (!target) continue;
          target.jersey = rec.jersey_number != null ? rec.jersey_number : target.jersey;
          if (rec.positions && rec.positions.length) {
            target.position = rec.positions[0].position || target.position;
            var mins = 0;
            for (var pi = 0; pi < rec.positions.length; pi++) {
              var po = rec.positions[pi];
              var f = clockToMin(po.from);
              var to = po.to ? clockToMin(po.to) : matchMinutes;
              if (f != null && to != null && to > f) mins += to - f;
            }
            if (mins > 0) target.minutes = Math.round(mins);
          }
        }
      }
    }

    /* --- xG cumule minute par minute -------------------------------------- */
    var race = [{ minute: 0, a: 0, b: 0 }];
    var ca = 0, cb = 0;
    var ordered = shots.slice().sort(function (x, y) {
      return (x.minute * 60 + x.second) - (y.minute * 60 + y.second);
    });
    for (i = 0; i < ordered.length; i++) {
      var sh = ordered[i];
      if (sh.team === TEAMS[0]) ca += sh.xg; else cb += sh.xg;
      race.push({ minute: sh.minute + (sh.second || 0) / 60, a: ca, b: cb, shot: sh });
    }
    race.push({ minute: matchMinutes, a: ca, b: cb });

    /* --- reseau de passes -------------------------------------------------- */
    var network = {};
    network[TEAMS[0]] = buildNetwork(passList, TEAMS[0], players);
    network[TEAMS[1]] = buildNetwork(passList, TEAMS[1], players);

    plist.sort(function (a, b) {
      if (a.team !== b.team) return a.team === TEAMS[0] ? -1 : 1;
      return b.minutes - a.minutes;
    });

    return {
      kind: 'statsbomb',
      teamNames: TEAMS,
      match: {
        teams: TEAMS,
        score: [teams[TEAMS[0]].goals, teams[TEAMS[1]].goals],
        minutes: matchMinutes,
        events: live.length,
        formations: [teams[TEAMS[0]].formation, teams[TEAMS[1]].formation]
      },
      teams: teams,
      players: plist,
      shots: shots,
      xgRace: race,
      network: network
    };
  }

  function clockToMin(str) {
    if (!str) return null;
    var p = String(str).split(':');
    if (p.length < 2) return null;
    return parseInt(p[0], 10) + parseInt(p[1], 10) / 60;
  }

  function buildNetwork(passes, team, players) {
    var nodes = {}, links = {};
    for (var i = 0; i < passes.length; i++) {
      var p = passes[i];
      if (p.team !== team || !p.complete || !p.player || !p.recipient) continue;
      if (p.setPiece) continue;
      if (!p.from) continue;
      if (!nodes[p.player]) nodes[p.player] = { name: p.player, x: 0, y: 0, n: 0, passes: 0 };
      nodes[p.player].x += p.from[0];
      nodes[p.player].y += p.from[1];
      nodes[p.player].n++;
      nodes[p.player].passes++;
      var key = p.player < p.recipient ? p.player + '|' + p.recipient : p.recipient + '|' + p.player;
      links[key] = (links[key] || 0) + 1;
    }
    var nl = [];
    for (var k in nodes) {
      var nd = nodes[k];
      if (nd.n < 3) continue;
      nl.push({
        name: nd.name, x: nd.x / nd.n, y: nd.y / nd.n, passes: nd.passes,
        jersey: players[nd.name] ? players[nd.name].jersey : null
      });
    }
    var ll = [];
    for (var kk in links) {
      if (links[kk] < 3) continue;
      var pair = kk.split('|');
      ll.push({ a: pair[0], b: pair[1], n: links[kk] });
    }
    ll.sort(function (a, b) { return b.n - a.n; });
    return { nodes: nl, links: ll.slice(0, 40) };
  }

  /* ============================================ parseur XML type SportsCode */
  function analyseSportsCode(xmlDoc) {
    var insts = xmlDoc.getElementsByTagName('instance');
    if (!insts.length) throw new Error('XML lu, mais aucune balise <instance> trouvée.');
    var rows = [];
    for (var i = 0; i < insts.length; i++) {
      var node = insts[i];
      var code = txt(node, 'code');
      var start = parseFloat(txt(node, 'start') || '0');
      var end = parseFloat(txt(node, 'end') || '0');
      var labels = [];
      var lnodes = node.getElementsByTagName('label');
      for (var j = 0; j < lnodes.length; j++) {
        labels.push({ group: txt(lnodes[j], 'group'), text: txt(lnodes[j], 'text') });
      }
      rows.push({ code: code || '(sans code)', start: start, end: end, labels: labels });
    }
    var byCode = {}, groups = {};
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!byCode[r.code]) byCode[r.code] = { code: r.code, count: 0, duration: 0, labels: {} };
      byCode[r.code].count++;
      byCode[r.code].duration += Math.max(0, r.end - r.start);
      for (var li = 0; li < r.labels.length; li++) {
        var lb = r.labels[li];
        var g = lb.group || 'label';
        if (!groups[g]) groups[g] = {};
        var tv = lb.text || '(vide)';
        groups[g][tv] = (groups[g][tv] || 0) + 1;
        var key = g + ' : ' + tv;
        byCode[r.code].labels[key] = (byCode[r.code].labels[key] || 0) + 1;
      }
    }
    var codes = [];
    for (var c in byCode) codes.push(byCode[c]);
    codes.sort(function (a, b) { return b.count - a.count; });
    return { kind: 'sportscode', instances: rows, codes: codes, groups: groups };
  }
  function txt(node, tag) {
    var el = node.getElementsByTagName(tag)[0];
    return el && el.textContent ? el.textContent.trim() : null;
  }

  /* ============================================================ parseur CSV */
  function parseCSV(text) {
    var delim = detectDelim(text);
    var rows = [], row = [], field = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
        } else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch === '\r') { /* ignore */ }
      else field += ch;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    rows = rows.filter(function (r) { return r.length > 1 || (r[0] && r[0].trim()); });
    if (rows.length < 2) throw new Error('CSV vide ou illisible.');
    var head = rows[0].map(function (h) { return h.trim(); });
    var data = [];
    for (var r2 = 1; r2 < rows.length; r2++) {
      var o = {};
      for (var c2 = 0; c2 < head.length; c2++) o[head[c2]] = (rows[r2][c2] || '').trim();
      data.push(o);
    }
    return { kind: 'csv', columns: head, rows: data };
  }
  function detectDelim(text) {
    var sample = text.slice(0, 5000);
    var cands = [',', ';', '\t', '|'], best = ',', bestN = 0;
    for (var i = 0; i < cands.length; i++) {
      var n = sample.split(cands[i]).length;
      if (n > bestN) { bestN = n; best = cands[i]; }
    }
    return best;
  }

  function numericColumns(csv) {
    var out = [];
    for (var i = 0; i < csv.columns.length; i++) {
      var col = csv.columns[i], ok = 0, tot = 0;
      for (var r = 0; r < csv.rows.length; r++) {
        var v = csv.rows[r][col];
        if (v === '' || v == null) continue;
        tot++;
        if (!isNaN(parseFloat(String(v).replace(',', '.')))) ok++;
      }
      if (tot > 0 && ok / tot > 0.8) out.push(col);
    }
    return out;
  }

  /* ==================================================== InStat / Hudl (xlsx)

     Deux exports, deux formes :
       - "Match statistics"  : une saison, deux lignes par match (nous, eux)
       - "Player statistics" : un cumul de saison, une ligne par joueur

     Trois pieges du format, qui faussent tout en silence si on les ignore :

     1. La colonne "Score" est ecrite DOMICILE:EXTERIEUR, et non nous:eux. Sur
        un match a l'exterieur elle est donc inversee. Lue naivement, elle
        transforme quatre defaites en victoires sur cette saison. Tout est
        calcule depuis la colonne "Goals" de chaque ligne ; "Score" ne sert
        plus que de controle croise.
     2. Les pourcentages sont stockes en fractions : 0.89 vaut 89 %.
     3. "Ball possession, min." est une chaine "m:ss" - exactement la meme
        forme que le score "1:2". On tranche donc par colonne, jamais sur
        l'allure de la valeur.                                                */

  function instatValue(header, raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (s === '' || s === '-') return null;
    if (/, %( of total)?$/.test(header)) {
      var p = parseFloat(s);
      return isFinite(p) ? p * 100 : null;
    }
    if (/, min\.$/.test(header)) {
      var m = /^(\d+):(\d+)$/.exec(s);
      if (m) return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
      var f = parseFloat(s);
      return isFinite(f) ? f : null;
    }
    // "3-4-3" et "0:0" doivent rester des chaines : parseFloat en tirerait 3 et 0.
    if (!/^-?[0-9]+(\.[0-9]+)?$/.test(s)) return s;
    return parseFloat(s);
  }

  function instatRow(hdr, row) {
    var o = {};
    for (var i = 0; i < hdr.length; i++) {
      if (!hdr[i]) continue;
      o[hdr[i]] = instatValue(hdr[i], row[i]);
    }
    return o;
  }

  function inum(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

  // Excel compte les jours depuis le 30/12/1899 ; la fraction est l'heure.
  function excelDate(serial) {
    var n = parseFloat(serial);
    if (!isFinite(n)) return null;
    var d = new Date(Math.round((n - 25569) * 86400000));
    return isNaN(d.getTime()) ? null : d;
  }

  function analyseInstatMatches(rows) {
    if (!rows || rows.length < 3) throw new Error('Feuille de matchs vide.');
    var hdr = rows[0].map(function (h) { return String(h == null ? '' : h).trim(); });

    var iDate = hdr.indexOf('Date'), iHA = hdr.indexOf('h / a');
    var iOpp = hdr.indexOf('Opponent'), iScore = hdr.indexOf('Score');
    var iTeam = hdr.indexOf('Team'), iGoals = hdr.indexOf('Goals');
    if (iDate < 0 || iTeam < 0 || iGoals < 0 || iOpp < 0) {
      throw new Error('Ce classeur n\u2019a pas la forme d\u2019un export InStat ' +
        '\u00ab Match statistics \u00bb (colonnes Date, Team, Opponent et Goals attendues).');
    }

    var matches = [], season = null, code = null, mismatches = 0, checked = 0;

    for (var i = 1; i < rows.length; i++) {
      var a = rows[i], b = rows[i + 1] || [];
      var first = String(a[iDate] == null ? '' : a[iDate]).trim();
      if (!first) continue;

      var us = instatRow(hdr, a), them = instatRow(hdr, b);

      if (/^average/i.test(first)) { season = { us: us, them: them }; i++; continue; }

      var d = excelDate(first);
      if (!d) continue;
      if (code == null) code = us['Team'];

      var gf = inum(us['Goals']), ga = inum(them['Goals']);
      var ha = String(a[iHA] == null ? '' : a[iHA]).trim().toLowerCase();
      var home = ha !== 'a';

      // Controle croise : "Score" doit se relire domicile:exterieur.
      var sc = String(a[iScore] == null ? '' : a[iScore]).trim();
      var pm = /^(\d+):(\d+)$/.exec(sc);
      if (pm) {
        checked++;
        var sh = parseInt(pm[1], 10), sa = parseInt(pm[2], 10);
        if ((home ? sh : sa) !== gf || (home ? sa : sh) !== ga) mismatches++;
      }

      matches.push({
        date: d,
        home: home,
        opponent: String(a[iOpp] == null ? '' : a[iOpp]).trim(),
        oppCode: them['Team'],
        gf: gf, ga: ga,
        result: gf > ga ? 'V' : (gf === ga ? 'N' : 'D'),
        points: gf > ga ? 3 : (gf === ga ? 1 : 0),
        formation: us['Tactics (initial)'] || '',
        oppFormation: them['Tactics (initial)'] || '',
        us: us, them: them
      });
      i++;
    }

    if (!matches.length) throw new Error('Aucun match lisible dans ce classeur.');
    matches.sort(function (x, y) { return x.date - y.date; });

    var tally = { V: 0, N: 0, D: 0 };
    var pts = 0, xpts = 0, gf = 0, ga = 0, xg = 0, oxg = 0;
    matches.forEach(function (m) {
      tally[m.result]++;
      pts += m.points;
      xpts += inum(m.us['xPoints']);
      gf += m.gf; ga += m.ga;
      xg += inum(m.us['xG (expected goals)']);
      oxg += inum(m.them['xG (expected goals)']);
      m.cumPoints = pts;
      m.cumXPoints = xpts;
    });

    return {
      code: code, matches: matches, season: season, headers: hdr,
      record: tally, points: pts, xPoints: xpts,
      goalsFor: gf, goalsAgainst: ga, xg: xg, oxg: oxg,
      // Si le controle croise casse partout, la regle domicile:exterieur ne
      // tient plus : le format a change, et il faut le dire plutot que mentir.
      scoreColumnSuspect: checked > 0 && mismatches > checked / 2
    };
  }

  function analyseInstatPlayers(rows) {
    if (!rows || rows.length < 2) throw new Error('Feuille de joueurs vide.');
    var hdr = rows[0].map(function (h) { return String(h == null ? '' : h).trim(); });
    var iName = hdr.indexOf('Player');
    if (iName < 0) {
      throw new Error('Ce classeur n\u2019a pas la forme d\u2019un export InStat ' +
        '\u00ab Player statistics \u00bb (colonne Player attendue).');
    }
    var players = [];
    for (var i = 1; i < rows.length; i++) {
      var name = String(rows[i][iName] == null ? '' : rows[i][iName]).trim();
      if (!name) continue;
      var o = instatRow(hdr, rows[i]);
      o.name = name;
      o.jersey = o['\u2116'];
      o.minutes = inum(o['Minutes played']);
      players.push(o);
    }
    if (!players.length) throw new Error('Aucun joueur lisible dans ce classeur.');
    return { players: players, headers: hdr };
  }

  // Les deux classeurs sont independants : on doit pouvoir n'en deposer qu'un.
  function analyseInstat(matchRows, playerRows) {
    var m = matchRows ? analyseInstatMatches(matchRows) : null;
    var p = playerRows ? analyseInstatPlayers(playerRows) : null;
    if (!m && !p) throw new Error('Aucun classeur InStat exploitable.');
    return {
      kind: 'instat',
      code: m ? m.code : null,
      matches: m ? m.matches : [],
      season: m ? m.season : null,
      record: m ? m.record : { V: 0, N: 0, D: 0 },
      points: m ? m.points : 0,
      xPoints: m ? m.xPoints : 0,
      goalsFor: m ? m.goalsFor : 0,
      goalsAgainst: m ? m.goalsAgainst : 0,
      xg: m ? m.xg : 0,
      oxg: m ? m.oxg : 0,
      scoreColumnSuspect: m ? m.scoreColumnSuspect : false,
      matchHeaders: m ? m.headers : [],
      players: p ? p.players : [],
      playerHeaders: p ? p.headers : []
    };
  }

  root.KMR = {
    analyseStatsBomb: analyseStatsBomb,
    analyseInstat: analyseInstat,
    analyseInstatMatches: analyseInstatMatches,
    analyseInstatPlayers: analyseInstatPlayers,
    instatValue: instatValue,
    excelDate: excelDate,
    analyseSportsCode: analyseSportsCode,
    parseCSV: parseCSV,
    numericColumns: numericColumns,
    helpers: { distToGoal: distToGoal, inBox: inBox, inFinalThird: inFinalThird, isProgressive: isProgressive },
    PITCH: { X: PITCH_X, Y: PITCH_Y }
  };
})(typeof module !== 'undefined' && module.exports ? module.exports : (typeof window !== 'undefined' ? window : this));
