#!/usr/bin/env python3
"""Carrega o CSV da outorga onerosa concedida (GeoSampa) em aval_outorga_ref. Dado público, sem pessoa.
Uso: python3 sandbox/carregar_outorga.py [--dsn ~/.config/novasp/prod-pooler.dsn] [--csv caminho]"""
import argparse, csv, os, psycopg2, psycopg2.extras
ap=argparse.ArgumentParser(); ap.add_argument('--dsn', default=os.path.expanduser('~/.config/novasp/prod-pooler.dsn'))
ap.add_argument('--csv', default=os.path.expanduser('~/Downloads/foca/dados/geosampa/outorga_onerosa_20261001.csv')); a=ap.parse_args()
def n(v):
    try: return float(str(v).replace(',','.')) if v not in ('',None,'None') else None
    except ValueError: return None
rows=[]
for r in csv.DictReader(open(a.csv,encoding='utf-8')):
    if not r['lat'] or not r['lng']: continue
    rows.append((int(r['cd_identificador_outorga_onerosa']), r['nm_distrito'], r['cd_setor_quadra'], r['nm_endereco'], n(r['qt_area_terreno']), n(r['cd_coeficiente_utilizacao']),
                 r['cd_categoria_uso'], r['cd_tipo_uso'], n(r['qt_area_excedente']), n(r['qt_valor_contrapartida']), n(r['ct_m2']), r['tx_situacao'], r['cd_numero_alvara'], r['cd_processo'], float(r['lng']), float(r['lat'])))
c=psycopg2.connect(open(a.dsn).read().strip()); cur=c.cursor()
cur.execute('truncate aval_outorga_ref')
psycopg2.extras.execute_values(cur, """insert into aval_outorga_ref (id,distrito,setor_quadra,endereco,area_terreno,coef_utilizacao,categoria_uso,tipo_uso,area_excedente,contrapartida,ct_m2,situacao,alvara,processo,geom)
  values %s""", rows, template="(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, st_setsrid(st_makepoint(%s,%s),4326))", page_size=500)
c.commit(); cur.execute('select count(*) from aval_outorga_ref'); print('aval_outorga_ref:', cur.fetchone()[0], 'linhas'); c.close()
