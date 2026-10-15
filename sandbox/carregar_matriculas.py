#!/usr/bin/env python3
"""Carrega sandbox/matriculas/matriculas_itbi.csv em aval_matricula (SQL 2026-10-15-aval-matricula.sql antes).

Uso (Rodrigo, no terminal dele):
    python3 carregar_matriculas.py                 # só conta, não grava
    python3 carregar_matriculas.py --gravar        # troca o conteúdo da tabela (uma transação)
    python3 carregar_matriculas.py --gravar --cidade   # a cidade inteira (padrão: só CEP 04…, Zona Sul e vizinhos)
"""
import csv, os, sys
CSV = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'matriculas', 'matriculas_itbi.csv')
cidade = '--cidade' in sys.argv
import re
linhas = [r for r in csv.DictReader(open(CSV)) if cidade or r['cep'].zfill(8).startswith('04')]   # a planilha guarda o CEP como número (sem o 0)
def num_cartorio(c):                     # "11  CARTORIO DE REGISTRO DE IMOVEL" / "11º Cartório…" → "11"
    m = re.search(r'\d{1,2}', c or ''); return m.group(0) if m else None
print(f'{len(linhas):,} contribuintes com matrícula ({"cidade inteira" if cidade else "CEP 04…"})')
if '--gravar' not in sys.argv:
    sys.exit('(sem --gravar: nada foi gravado)')
import psycopg2, psycopg2.extras
con = psycopg2.connect(open(os.path.expanduser('~/.config/novasp/prod-pooler.dsn')).read().strip())
with con, con.cursor() as cur:
    cur.execute('truncate aval_matricula')
    psycopg2.extras.execute_values(cur, 'insert into aval_matricula (sql, matricula, cartorio, data) values %s',
        [(r['sql'], r['matricula'], num_cartorio(r['cartorio']), r['data'] or None) for r in linhas], page_size=2000)
    cur.execute("select count(*), pg_size_pretty(pg_total_relation_size('aval_matricula')), pg_size_pretty(pg_database_size(current_database())) from aval_matricula")
    n, tam, banco = cur.fetchone()
print(f'Gravado: {n:,} linhas · tabela {tam} · banco {banco}')
