# -*- coding: utf-8 -*-
"""Projette le fichier StatsBomb brut sur les seuls champs lus par le moteur.
Objectif : embarquer un match de demo dans la page sans la faire grossir de 2,5 Mo.
Le resultat garde exactement la meme forme que le fichier d'origine, donc il
emprunte le meme chemin de code que n'importe quel fichier importe par l'utilisateur.
"""
import json
import os

ROOT = os.path.dirname(os.path.abspath(__file__))

TOP = ['id', 'period', 'minute', 'second', 'duration', 'possession',
       'counterpress', 'location']
NAMED = ['type', 'team', 'player', 'position', 'possession_team']

SUB = {
    'pass': ['outcome', 'type', 'length', 'cross', 'end_location',
             'shot_assist', 'goal_assist', 'recipient', 'aerial_won'],
    'shot': ['statsbomb_xg', 'outcome', 'key_pass_id', 'body_part', 'type', 'aerial_won'],
    'carry': ['end_location'],
    'dribble': ['outcome'],
    'duel': ['type', 'outcome'],
    'foul_committed': ['card'],
    'bad_behaviour': ['card'],
    'goalkeeper': ['type'],
    'clearance': ['aerial_won'],
    'miscontrol': ['aerial_won'],
    'ball_receipt': ['aerial_won'],
    'substitution': ['replacement'],
}


def named(v):
    """Reduit {"id": 30, "name": "Pass"} a {"name": "Pass"}."""
    if isinstance(v, dict) and 'name' in v:
        return {'name': v['name']}
    return v


def rnd(v, d=1):
    """Arrondit les flottants : la 7e decimale d'une coordonnee ne sert a rien
    et coute 6 octets par valeur, soit des centaines de Ko sur un match."""
    if isinstance(v, list):
        return [rnd(x, d) for x in v]
    if isinstance(v, float):
        r = round(v, d)
        return int(r) if r == int(r) else r
    return v


def project(ev, keep_ids):
    out = {}
    for k in TOP:
        if k not in ev:
            continue
        if k == 'id':
            if ev['id'] in keep_ids:
                out['id'] = ev['id']
            continue
        if k in ('location', 'duration'):
            out[k] = rnd(ev[k], 1)
        else:
            out[k] = ev[k]
    for k in NAMED:
        if k in ev:
            out[k] = named(ev[k])

    for key, fields in SUB.items():
        if key not in ev:
            continue
        src = ev[key]
        if not isinstance(src, dict):
            continue
        d = {}
        for f in fields:
            if f not in src:
                continue
            v = src[f]
            if isinstance(v, dict):
                d[f] = named(v)
            elif f == 'statsbomb_xg':
                d[f] = rnd(v, 4)
            elif f == 'length':
                # Pas d'arrondi : le seuil "passe longue" est a 32 m et un
                # arrondi au dixieme fait basculer les passes pile a la limite.
                d[f] = v
            else:
                d[f] = rnd(v, 1)
        if d:
            out[key] = d

    # compos de depart : formation + onze
    if 'tactics' in ev:
        t = ev['tactics']
        d = {}
        if 'formation' in t:
            d['formation'] = t['formation']
        if 'lineup' in t:
            d['lineup'] = [{
                'player': named(p.get('player', {})),
                'position': named(p.get('position', {})),
                'jersey_number': p.get('jersey_number'),
            } for p in t['lineup']]
        out['tactics'] = d

    return out


def main():
    src = os.path.join(ROOT, 'data', 'events_8658.json')
    with open(src, encoding='utf-8') as fh:
        events = json.load(fh)

    # Seul un tir sait retrouver sa passe cle. On ne garde donc l'uuid que sur
    # les passes reellement citees par un tir : ~20 sur 3000 evenements.
    keep_ids = set()
    for e in events:
        sh = e.get('shot') or {}
        if sh.get('key_pass_id'):
            keep_ids.add(sh['key_pass_id'])

    slim = [project(e, keep_ids) for e in events]
    dst = os.path.join(ROOT, 'data', 'demo_events.json')
    with open(dst, 'w', encoding='utf-8') as fh:
        json.dump(slim, fh, ensure_ascii=False, separators=(',', ':'))

    lsrc = os.path.join(ROOT, 'data', 'lineups_8658.json')
    with open(lsrc, encoding='utf-8') as fh:
        lineups = json.load(fh)
    slim_l = [{
        'team_name': t['team_name'],
        'lineup': [{
            'player_name': p['player_name'],
            'player_nickname': p.get('player_nickname'),
            'jersey_number': p.get('jersey_number'),
            'positions': [{'position': q.get('position'),
                           'from': q.get('from'),
                           'to': q.get('to')} for q in p.get('positions', [])],
        } for p in t['lineup']],
    } for t in lineups]
    ldst = os.path.join(ROOT, 'data', 'demo_lineups.json')
    with open(ldst, 'w', encoding='utf-8') as fh:
        json.dump(slim_l, fh, ensure_ascii=False, separators=(',', ':'))

    print('events  %8d o  ->  %8d o' % (os.path.getsize(src), os.path.getsize(dst)))
    print('lineups %8d o  ->  %8d o' % (os.path.getsize(lsrc), os.path.getsize(ldst)))


if __name__ == '__main__':
    main()
