#!/usr/bin/env python3
"""Dá posição às vendas do ITBI que estão SEM coordenada (aval_itbi.geom nulo — ~273 mil, a cidade inteira),
para que entrem nos comparáveis por raio e no mapa da avaliação.

Fonte: lotes fiscais do GeoSampa (camada geoportal:lote_cidadao), baixados por setor fiscal em 04/10/2026 e
salvos em sandbox/lotes_geosampa/brutos_cidade/*.txt (formato "setor>qqq|num|x|y ... Qqqq|x|y", UTM 23S).
Regra: centro do LOTE pelo setor+quadra da própria guia + número de porta; sem número casado, centro da QUADRA
fiscal. Nunca centro de CEP. No fim recria aval_rua_geo (localizador de endereço do pino), que deriva do aval_itbi.

Uso:  python3 sandbox/posicionar_itbi_lotes.py            (só mostra o que faria)
      python3 sandbox/posicionar_itbi_lotes.py --gravar   (grava; salva a lista das vendas posicionadas)
      python3 sandbox/posicionar_itbi_lotes.py --desfazer (volta a deixar sem posição as vendas da lista)
"""
import csv, glob, io, json, os, re, sys, psycopg2
from pyproj import Transformer
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lotes_geosampa')
LISTA = os.path.join(D, 'posicionadas_20261004.csv')
c = psycopg2.connect(open(os.path.expanduser('~/.config/novasp/prod-pooler.dsn')).read().strip(), connect_timeout=30)
cur = c.cursor(); cur.execute("set statement_timeout=0")

def recria_rua_geo():
    cur.execute("""create table aval_rua_geo_novo as
      select aval_norm_rua(logradouro) rua_norm, ltrim(trim(numero),'0') numero,
             percentile_cont(0.5) within group (order by st_y(geom)) lat,
             percentile_cont(0.5) within group (order by st_x(geom)) lng, count(*) n
        from aval_itbi where geom is not null and logradouro is not null group by 1, 2;
      drop table aval_rua_geo; alter table aval_rua_geo_novo rename to aval_rua_geo;
      create index on aval_rua_geo (rua_norm, numero);
      create index aval_rua_geo_trgm on aval_rua_geo using gin (rua_norm gin_trgm_ops);
      alter table aval_rua_geo enable row level security; revoke all on aval_rua_geo from anon, authenticated;""")
    cur.execute("select count(*) from aval_rua_geo"); print('localizador de endereço recriado:', cur.fetchone()[0], 'endereços')

if '--desfazer' in sys.argv:
    cur.execute("create temp table _ids (id bigint)")
    with open(LISTA) as f: next(f); cur.copy_expert("copy _ids from stdin with csv", io.StringIO(''.join(l.split(',')[0] + '\n' for l in f)))
    cur.execute("update aval_itbi i set geom = null from _ids x where i.id = x.id"); print('voltaram a ficar sem posição:', cur.rowcount)
    recria_rua_geo(); c.commit(); sys.exit()

# 1) lotes baixados
lotes, quadras = {}, {}
for arq in sorted(glob.glob(os.path.join(D, 'brutos_cidade', '*.txt'))):
    t = open(arq, encoding='utf-8').read()
    if t.lstrip().startswith('['):
        t = json.loads(t)[0]['text']; i, j = t.find('"'), t.rfind('"'); t = json.loads(t[i:j + 1])
    for linha in t.strip().split('\n'):
        if '>' not in linha: continue
        setor, resto = linha.split('>', 1)
        for it in resto.split(' '):
            p = it.split('|')
            if it.startswith('Q') and len(p) == 3: quadras[(setor, p[0][1:])] = (float(p[1]), float(p[2]))
            elif len(p) == 4: lotes[(setor, p[0], p[1])] = (float(p[2]), float(p[3]))
print(f'lotes baixados: {len(lotes)} com número, {len(quadras)} quadras, {len({k[0] for k in quadras})} setores')

# 2) vendas sem posição
cur.execute("select id, setor, quadra, ltrim(regexp_replace(coalesce(numero,''),'\\D','','g'),'0') from aval_itbi where geom is null")
vendas = cur.fetchall(); print('vendas sem posição:', len(vendas))
tr = Transformer.from_crs('EPSG:31983', 'EPSG:4326', always_xy=True)
saida, via = [], {'lote': 0, 'quadra': 0, 'nada': 0}
for vid, s, q, n in vendas:
    xy = lotes.get((s, q, n)); v = 'lote'
    if xy is None: xy = quadras.get((s, q)); v = 'quadra'
    if xy is None: via['nada'] += 1; continue
    lo, la = tr.transform(*xy); saida.append((vid, la, lo, v)); via[v] += 1
print('posicionáveis:', via)
if '--gravar' not in sys.argv:
    print('Nada gravado. Para gravar: python3 sandbox/posicionar_itbi_lotes.py --gravar'); sys.exit()

# 3) grava
with open(LISTA, 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['id', 'lat', 'lng', 'via']); w.writerows(saida)
cur.execute("create temp table _p (id bigint, lat float8, lng float8, via text)")
buf = io.StringIO(); csv.writer(buf).writerows(saida); buf.seek(0)
cur.copy_expert("copy _p from stdin with csv", buf)
cur.execute("update aval_itbi i set geom = st_setsrid(st_makepoint(p.lng, p.lat), 4326) from _p p where i.id = p.id and i.geom is null")
print('posicionadas:', cur.rowcount)
cur.execute("analyze aval_itbi")
recria_rua_geo()
c.commit()
cur.execute("select count(*), count(geom) from aval_itbi"); print('aval_itbi total / com posição:', cur.fetchone())
