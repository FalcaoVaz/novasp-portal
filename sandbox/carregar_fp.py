#!/usr/bin/env python3
"""Carrega o Fator de Planejamento (Quadro 6 do PDE) em aval_fp: macroáreas (macroareas.geojson, 13 polígonos)
com o Fp por sigla + setores da Macroárea de Estruturação Metropolitana da área NSP (fp_mem_nsp_20261001.json,
extraído do GeoSampa com coordenadas em metros EPSG:31983). Dado público. Uso: python3 sandbox/carregar_fp.py"""
import argparse, json, os, psycopg2, psycopg2.extras
from pyproj import Transformer
ap=argparse.ArgumentParser(); ap.add_argument('--dsn', default=os.path.expanduser('~/.config/novasp/prod-pooler.dsn'))
ap.add_argument('--pasta', default=os.path.expanduser('~/Downloads/foca/dados/geosampa')); a=ap.parse_args()
tr=Transformer.from_crs('EPSG:31983','EPSG:4326',always_xy=True)
def conv(c):
    if isinstance(c[0],(int,float)): x,y=tr.transform(c[0],c[1]); return [round(x,6),round(y,6)]
    return [conv(x) for x in c]
FP_MACRO={'MUC':('0,7',0.7),'MQU':('0,6',0.6),'MCQUA':('1,0',1.0),'MRVRA':('1,0',1.0),'MRVU':('0,3',0.3),'MPEN':('Não se aplica',None),'MCUUS':('Não se aplica',None),'MEM':('1,2 (setor não detalhado)',1.2)}
rows=[]; nid=1000
m=json.load(open(os.path.join(a.pasta,'macroareas.geojson'),encoding='utf-8'))
for f in m['features']:
    p=f['properties']; sg=p.get('sg_macroarea')
    if not f.get('geometry'): continue
    tx,v=FP_MACRO.get(sg,('?',None)); nid+=1
    rows.append((nid, sg, p.get('nm_macroarea'), None, None, tx, v, json.dumps({'type':f['geometry']['type'],'coordinates':conv(f['geometry']['coordinates'])})))
mem=json.load(open(os.path.join(a.pasta,'fp_mem_nsp_20261001.json'),encoding='utf-8'))
for f in mem:
    tx=f.get('fp') or ''
    try: v=float(str(tx).replace(',','.'))
    except ValueError: v=None
    rows.append((f['id'], 'MEM', 'Macroarea de Estruturacao Metropolitana', f.get('setor'), f.get('subsetor'), tx, v, json.dumps({'type':f['type'],'coordinates':conv(f['coords'])})))
c=psycopg2.connect(open(a.dsn).read().strip()); cur=c.cursor(); cur.execute('truncate aval_fp')
psycopg2.extras.execute_values(cur, "insert into aval_fp (id,sg_macroarea,macroarea,setor,subsetor,fp_texto,fp,geom) values %s", rows, template="(%s,%s,%s,%s,%s,%s,%s, st_makevalid(st_setsrid(st_geomfromgeojson(%s),4326)))", page_size=20)
c.commit(); cur.execute('select count(*), count(fp) from aval_fp'); print('aval_fp:', cur.fetchone()); c.close()
