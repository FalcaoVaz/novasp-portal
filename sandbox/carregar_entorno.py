#!/usr/bin/env python3
"""Carrega estações de metrô/trem (aval_poi) e eixos ativados (aval_eixo) a partir dos GeoJSON do GeoSampa
já baixados para o Foca (~/Downloads/foca/dados/geosampa). Dado público."""
import argparse, json, os, psycopg2, psycopg2.extras
from pyproj import Transformer
ap=argparse.ArgumentParser(); ap.add_argument('--dsn', default=os.path.expanduser('~/.config/novasp/prod-pooler.dsn'))
ap.add_argument('--pasta', default=os.path.expanduser('~/Downloads/foca/dados/geosampa')); a=ap.parse_args()
tr=Transformer.from_crs('EPSG:31983','EPSG:4326',always_xy=True)
def conv(c):
    if isinstance(c[0],(int,float)): x,y=tr.transform(c[0],c[1]); return [round(x,6),round(y,6)]
    return [conv(x) for x in c]
m=json.load(open(os.path.join(a.pasta,'estacao_metro.geojson'),encoding='utf-8'))
pois=[(f['properties']['cd_identificador'],'metro',f['properties'].get('nm_estacao_metro_trem'),f['properties'].get('nm_linha_metro_trem'),f['properties'].get('nm_empresa_metro_trem'),f['properties'].get('tx_situacao_metro_trem'),f['geometry']['coordinates'][0],f['geometry']['coordinates'][1]) for f in m['features'] if f.get('geometry')]
e=json.load(open(os.path.join(a.pasta,'eixos_ativados.geojson'),encoding='utf-8'))
eixos=[(f['properties']['cd_identificador'],f['properties'].get('nm_eixo_ativado_decreto'),f['properties'].get('tx_decreto'),json.dumps({'type':f['geometry']['type'],'coordinates':conv(f['geometry']['coordinates'])})) for f in e['features'] if f.get('geometry')]
c=psycopg2.connect(open(a.dsn).read().strip()); cur=c.cursor()
cur.execute('truncate aval_poi'); psycopg2.extras.execute_values(cur,"insert into aval_poi (id,tipo,nome,linha,empresa,situacao,geom) values %s",pois,template="(%s,%s,%s,%s,%s,%s, st_setsrid(st_makepoint(%s,%s),4326))")
cur.execute('truncate aval_eixo'); psycopg2.extras.execute_values(cur,"insert into aval_eixo (id,nome,decreto,geom) values %s",eixos,template="(%s,%s,%s, st_makevalid(st_setsrid(st_geomfromgeojson(%s),4326)))",page_size=30)
c.commit(); cur.execute('select (select count(*) from aval_poi),(select count(*) from aval_eixo)'); print('aval_poi / aval_eixo:', cur.fetchone()); c.close()
