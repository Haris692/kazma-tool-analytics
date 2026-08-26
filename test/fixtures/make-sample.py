# -*- coding: utf-8 -*-
"""Fabrique instat-sample.xlsx : un classeur au format InStat, entierement
invente.

Aucune donnee de club ne peut etre versionnee dans un depot public, et un
controle qui ne tourne que sur la machine de quelqu'un ne protege personne.
Ce classeur reproduit donc la FORME de l'export - pas son contenu - et porte
exactement les pieges que le moteur doit savoir eviter :

  - un match a l'exterieur dont le Score "2:0" est ecrit domicile:exterieur,
    donc une defaite 0-2 pour nous, qu'une lecture naive prendrait pour une
    victoire ;
  - des pourcentages stockes en fractions (0.61 pour 61 %) ;
  - une duree ecrite "27:30", de la meme forme qu'un score ;
  - un dispositif "4-2-3-1", que parseFloat reduirait a 4 ;
  - des cases vides notees "-" ;
  - des dates en numero de serie Excel ;
  - les deux lignes "Average per match" de fin de fichier.

Le fichier est compresse en deflate, pour que le lecteur exerce aussi sa
decompression. Regenerer :  python test/fixtures/make-sample.py
"""
import datetime
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'instat-sample.xlsx')

EPOCH = datetime.datetime(1899, 12, 30)


def serial(dt):
    return (dt - EPOCH).total_seconds() / 86400.0


COLS = [
    'Date', 'h / a', 'Opponent', 'Score', 'Team', 'Goals',
    'Ball possession, %', 'Ball possession, min.', 'Tactics (initial)',
    'Red cards', 'xPoints', 'xG (expected goals)', 'Shots',
]

D1 = serial(datetime.datetime(2026, 3, 1, 19, 0))
D2 = serial(datetime.datetime(2026, 3, 8, 20, 30))

# Match 1 : a domicile, gagne 3-1. Score "3:1" se lit domicile:exterieur, et
# comme nous recevons, il coincide avec nous:eux - ce cas ne prouve rien seul.
# Match 2 : a l'exterieur. Score "2:0" = domicile 2, exterieur 0. Nous sommes
# l'exterieur : nous perdons 0-2. C'est ce match qui fait tout le controle.
ROWS = [
    COLS,
    [D1, 'h', 'FC Alpha', '3:1', 'OUR', 3, 0.61, '27:30', '4-2-3-1', '-', 2.1, 2.4, 14],
    ['', '', '', '', 'ALP', 1, 0.39, '17:30', '4-4-2 classic', '-', 0.6, 0.9, 6],
    [D2, 'a', 'FC Beta', '2:0', 'OUR', 0, 0.44, '19:45', '4-3-3 down', '-', 0.8, 0.7, 5],
    ['', '', '', '', 'BET', 2, 0.56, '25:10', '3-4-3', 1, 2.4, 1.9, 11],
    ['Average per match', '', '', '', 'OUR', 1.5, 0.525, '23:37', '-', '-', 1.45, 1.55, 9.5],
    ['', '', '', '', 'OPP', 1.5, 0.475, '21:20', '-', '-', 1.5, 1.4, 8.5],
]


def col_letter(i):
    s = ''
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;')
             .replace('>', '&gt;').replace('"', '&quot;'))


def build():
    # Les chaines passent par la table partagee, comme dans un vrai export.
    shared = []
    index = {}

    def sid(v):
        if v not in index:
            index[v] = len(shared)
            shared.append(v)
        return index[v]

    xml = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
           '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
           '<sheetData>']
    for r, row in enumerate(ROWS, start=1):
        xml.append('<row r="%d">' % r)
        for c, val in enumerate(row):
            ref = '%s%d' % (col_letter(c), r)
            if val == '':
                continue
            if isinstance(val, (int, float)):
                xml.append('<c r="%s"><v>%s</v></c>' % (ref, repr(val)))
            else:
                xml.append('<c r="%s" t="s"><v>%d</v></c>' % (ref, sid(str(val))))
        xml.append('</row>')
    xml.append('</sheetData></worksheet>')
    sheet = ''.join(xml)

    ss = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
          '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
          'count="%d" uniqueCount="%d">%s</sst>'
          % (len(shared), len(shared),
             ''.join('<si><t>%s</t></si>' % esc(s) for s in shared)))

    parts = {
        '[Content_Types].xml':
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
            '</Types>',
        '_rels/.rels':
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>',
        'xl/workbook.xml':
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Match statistics" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels':
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
            '</Relationships>',
        'xl/sharedStrings.xml': ss,
        'xl/worksheets/sheet1.xml': sheet,
    }

    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in parts.items():
            z.writestr(name, data)

    print('%s  %d octets' % (OUT, os.path.getsize(OUT)))


if __name__ == '__main__':
    build()
