# -*- coding: utf-8 -*-
"""Assemble la page autonome a partir des sources de src/.

Sortie : dist/rapport-match.html - un seul fichier, aucune dependance externe
hormis la feuille Google Fonts. Il s'ouvre directement dans un navigateur et
se publie tel quel comme Artifact (pas de balises html/head/body : l'hote les
fournit, et un navigateur local les cree de lui-meme).

Usage :
    python build.py            # avec le match de demo embarque
    python build.py --no-demo  # page vide, l'utilisateur importe son fichier
"""
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')


def read(path):
    with open(path, encoding='utf-8') as fh:
        return fh.read()


def main():
    with_demo = '--no-demo' not in sys.argv

    tpl = read(os.path.join(SRC, 'index.template.html'))
    styles = read(os.path.join(SRC, 'styles.css'))
    engine = read(os.path.join(SRC, 'engine.js'))
    app = read(os.path.join(SRC, 'app.js'))

    if with_demo:
        demo_events = read(os.path.join(ROOT, 'data', 'demo_events.json'))
        demo_lineups = read(os.path.join(ROOT, 'data', 'demo_lineups.json'))
    else:
        demo_events = demo_lineups = ''

    # Une chaine du JSON contenant "</script>" fermerait la balise par surprise.
    # Le seul echappement necessaire dans un bloc script est celui de "<".
    demo_events = demo_events.replace('<', '\\u003c')
    demo_lineups = demo_lineups.replace('<', '\\u003c')

    # Les sources sont injectees telles quelles : str.replace evite que des
    # sequences comme \g ou \1 dans le JS soient interpretees par le moteur regex.
    out = tpl
    for token, value in (
        ('__STYLES__', styles),
        ('__ENGINE__', engine),
        ('__APP__', app),
        ('__DEMO_EVENTS__', demo_events),
        ('__DEMO_LINEUPS__', demo_lineups),
    ):
        if token not in out:
            raise SystemExit('jeton absent du gabarit : %s' % token)
        out = out.replace(token, value)

    if not os.path.isdir(DIST):
        os.makedirs(DIST)
    dst = os.path.join(DIST, 'rapport-match.html')
    with open(dst, 'w', encoding='utf-8') as fh:
        fh.write(out)

    size = os.path.getsize(dst)
    print('%s  %.0f Ko%s' % (dst, size / 1024.0, '' if with_demo else '  (sans demo)'))

    # Sans la demo, la page doit rester legere : c'est le signe que rien
    # d'inattendu n'a ete embarque.
    if not with_demo and size > 200 * 1024:
        print('  attention : page vide anormalement lourde')


if __name__ == '__main__':
    main()
