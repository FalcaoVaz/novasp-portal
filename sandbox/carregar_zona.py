#!/usr/bin/env python3
"""Recarrega aval_zona (zoneamento Lei 18.177/2024, Mapa 1) a partir do GeoJSON do GeoSampa
(camada geoportal:perimetro_zona_lei_18177_24, EPSG:31983). Substitui o conteúdo (truncate + insert).
Uso: python3 sandbox/carregar_zona.py [--arquivo ~/Downloads/foca/dados/geosampa/geosampa_zonas_18177_zonasul_20261001.geojson]"""
import argparse, json, os, psycopg2, psycopg2.extras
from pyproj import Transformer
ap=argparse.ArgumentParser(); ap.add_argument('--dsn', default=os.path.expanduser('~/.config/novasp/prod-pooler.dsn'))
ap.add_argument('--arquivo', default=os.path.expanduser('~/Downloads/foca/dados/geosampa/geosampa_zonas_18177_zonasul_20261001.geojson')); a=ap.parse_args()
tr=Transformer.from_crs('EPSG:31983','EPSG:4326',always_xy=True)
def conv(c):
    if isinstance(c[0],(int,float)): x,y=tr.transform(c[0],c[1]); return [round(x,7),round(y,7)]
    return [conv(x) for x in c]
d=json.load(open(a.arquivo,encoding='utf-8')); rows=[]
for f in d['features']:
    g=f.get('geometry'); p=f['properties']
    if not g: continue
    rows.append((p['cd_identificador'], p.get('cd_zoneamento_perimetro'), 'L18177/2024', json.dumps({'type':g['type'],'coordinates':conv(g['coordinates'])})))
print('feições:', len(rows), '| zonas distintas:', len({r[1] for r in rows}))
c=psycopg2.connect(open(a.dsn).read().strip()); cur=c.cursor(); cur.execute("set statement_timeout='900s'")
cur.execute('truncate aval_zona')
for i in range(0, len(rows), 2000):
    psycopg2.extras.execute_values(cur, "insert into aval_zona (id, zona, lei, geom) values %s", rows[i:i+2000], template="(%s,%s,%s, st_multi(st_collectionextract(st_makevalid(st_setsrid(st_geomfromgeojson(%s),4326)),3)))", page_size=200)
    print(f'\r  {min(i+2000,len(rows))}/{len(rows)}', end='', flush=True)
c.commit(); print()
cur.execute("select count(*), pg_size_pretty(pg_total_relation_size('aval_zona')), st_extent(geom)::text from aval_zona"); print('aval_zona:', cur.fetchone())
cur.execute("select z.zona, count(*) from aval_zona z left join aval_zona_param p on p.zona=z.zona where p.zona is null group by 1"); print('zonas sem parâmetro:', cur.fetchall()); c.close()
