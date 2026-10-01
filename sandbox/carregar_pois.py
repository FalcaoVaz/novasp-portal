#!/usr/bin/env python3
"""Carrega os pontos de interesse da base de vizinhança do site (nsp-site/_vizinhanca/pois.csv — GeoSampa + OSM,
dado público: metrô, ônibus, ciclovia, parque, escola, feira, clube, hospital) em aval_poi.
Mantém as estações de metrô já carregadas (ids do GeoSampa, com linha/empresa); os demais tipos entram com id >= 1.000.000."""
import csv, os, argparse, psycopg2, psycopg2.extras
ap=argparse.ArgumentParser(); ap.add_argument('--dsn', default=os.path.expanduser('~/.config/novasp/prod-pooler.dsn'))
ap.add_argument('--csv', default=os.path.expanduser('~/Downloads/nsp-site/_vizinhanca/pois.csv')); a=ap.parse_args()
rows=[]; i=1_000_000
for r in csv.DictReader(open(a.csv,encoding='utf-8'),delimiter=';'):
    if r['tipo']=='metro': continue
    i+=1; rows.append((i, r['tipo'], r['nome'][:120], float(r['lng']), float(r['lat'])))
c=psycopg2.connect(open(a.dsn).read().strip()); cur=c.cursor()
cur.execute("delete from aval_poi where id >= 1000000")
for k in range(0,len(rows),5000):
    psycopg2.extras.execute_values(cur,"insert into aval_poi (id,tipo,nome,geom) values %s",rows[k:k+5000],template="(%s,%s,%s, st_setsrid(st_makepoint(%s,%s),4326))")
    c.commit()
cur.execute("select tipo, count(*) from aval_poi group by 1 order by 2 desc"); print(cur.fetchall())
cur.execute("select pg_size_pretty(pg_total_relation_size('aval_poi')), pg_size_pretty(pg_database_size(current_database()))"); print('aval_poi / banco:', cur.fetchone()); c.close()
