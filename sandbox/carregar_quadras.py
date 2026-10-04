#!/usr/bin/env python3
"""Carrega aval_quadra (centro das quadras fiscais do GeoSampa) — ver portal/sql/2026-10-04-aval-quadra.sql. Dado público."""
import csv, io, os, psycopg2
F = os.path.expanduser('~/Downloads/foca/dados/geosampa/quadras_centro_cidade_20261004.csv')
c = psycopg2.connect(open(os.path.expanduser('~/.config/novasp/prod-pooler.dsn')).read().strip()); cur = c.cursor()
cur.execute(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'portal/sql/2026-10-04-aval-quadra.sql')).read())
buf = io.StringIO(); n = 0
for r in csv.DictReader(open(F)):
    buf.write(f"{r['setor']}\t{r['quadra']}\t{r['lat']}\t{r['lng']}\t{r.get('distrito') or ''}\n"); n += 1
buf.seek(0)
cur.execute("create temp table _q (like aval_quadra)"); cur.copy_from(buf, '_q', null='')
cur.execute("insert into aval_quadra select * from _q on conflict (setor, quadra) do update set lat=excluded.lat, lng=excluded.lng, distrito=excluded.distrito")
print('quadras:', cur.rowcount); c.commit()
cur.execute("select * from aval_quadra_ponto('047.278.0208-2')"); print('teste Manoel Correia Jr 86:', cur.fetchone())
cur.execute("select pg_size_pretty(pg_total_relation_size('aval_quadra')), pg_size_pretty(pg_database_size(current_database()))"); print('tamanho / banco:', cur.fetchone())
