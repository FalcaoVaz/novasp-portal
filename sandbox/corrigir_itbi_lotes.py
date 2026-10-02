#!/usr/bin/env python3
"""Corrige a posição das vendas de ITBI que estavam no CENTRO DO CEP (metade da base geolocalizada).

Problema: a carga antiga (carregar_itbi_geo.py) punha no centro do CEP toda venda cujo endereço não estava na base
de prédios do Foca. Resultado: todos os números de uma rua no mesmo ponto (mapa sem pontos, busca por raio torta;
ex.: R. Manuel da Nóbrega caía 13 km ao sul por CEP malformado).

Correção: centro do LOTE (GeoSampa, camada lote_cidadao), casado pelo setor + quadra fiscal + número de porta da
própria venda; sem número casado, centro da QUADRA fiscal. Arquivos em sandbox/lotes_geosampa/ (dado público,
coordenadas UTM 23S / EPSG:31983). Backup das coordenadas antigas: lotes_geosampa/backup_geom_itbi_20261002.csv.

Uso:  python3 sandbox/corrigir_itbi_lotes.py            (só mostra o que mudaria)
      python3 sandbox/corrigir_itbi_lotes.py --gravar   (grava)
      python3 sandbox/corrigir_itbi_lotes.py --desfazer (volta as coordenadas do backup)
"""
import csv, os, sys, psycopg2
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lotes_geosampa')
DSN = open(os.path.expanduser('~/.config/novasp/prod-pooler.dsn')).read().strip()
c = psycopg2.connect(DSN, connect_timeout=30); cur = c.cursor(); cur.execute("set statement_timeout=0")

if '--desfazer' in sys.argv:
    cur.execute("create temp table _b (id bigint, wkt text)")
    with open(os.path.join(D, 'backup_geom_itbi_20261002.csv')) as f:
        next(f); cur.copy_expert("copy _b from stdin with csv", f)
    cur.execute("update aval_itbi i set geom = st_geomfromtext(b.wkt, 4326) from _b b where i.id = b.id")
    print('restauradas:', cur.rowcount); c.commit(); sys.exit()

cur.execute("""create temp table _alvo as
  with g as (select geom from aval_itbi where geom is not null group by geom having count(distinct ltrim(numero,'0')) >= 3)
  select i.id, i.setor, i.quadra, ltrim(regexp_replace(coalesce(i.numero,''),'\\D','','g'),'0') num, i.geom antes
    from aval_itbi i join g using (geom)""")
cur.execute("create temp table _n (setor text, quadra text, num text, x float8, y float8)")
cur.execute("create temp table _q (setor text, quadra text, x float8, y float8)")
cur.copy_from(open(os.path.join(D, 'lotes_num.tsv')), '_n'); cur.copy_from(open(os.path.join(D, 'lotes_quadra.tsv')), '_q')
cur.execute("""create temp table _novo as
  select a.id,
         coalesce(st_transform(st_setsrid(st_makepoint(n.x, n.y), 31983), 4326), st_transform(st_setsrid(st_makepoint(q.x, q.y), 31983), 4326)) g,
         case when n.x is not null then 'lote' else 'quadra' end via, a.antes
    from _alvo a left join _n n on n.setor = a.setor and n.quadra = a.quadra and n.num = a.num
                 left join _q q on q.setor = a.setor and q.quadra = a.quadra
   where n.x is not null or q.x is not null""")
cur.execute("""select via, count(*), round(percentile_cont(0.5) within group (order by st_distance(antes::geography, g::geography)))
                 from _novo group by 1 order by 1""")
for via, n, med in cur.fetchall(): print(f'{via}: {n} vendas (deslocamento mediano {int(med)} m)')
if '--gravar' not in sys.argv:
    print('Nada gravado. Para gravar: python3 sandbox/corrigir_itbi_lotes.py --gravar'); sys.exit()
cur.execute("update aval_itbi i set geom = v.g from _novo v where i.id = v.id")
print('atualizadas:', cur.rowcount); c.commit()
cur.execute("analyze aval_itbi"); c.commit()
cur.execute("""with g as (select geom, count(distinct ltrim(numero,'0')) nn, count(*) n from aval_itbi where geom is not null group by geom)
               select coalesce(sum(n) filter (where nn >= 3), 0), sum(n) from g""")
print('ainda empilhadas (3+ números no mesmo ponto) / total com posição:', cur.fetchone())
