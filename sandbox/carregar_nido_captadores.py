#!/usr/bin/env python3
"""Carrega os CAPTADORES dos imóveis do Nido (ANGARIADOR em exporta_imovel_profissional) em nido_captadores.
Antes: SQL portal/sql/2026-10-27-acervo-nido-captadores.sql.

Uso (Rodrigo, no terminal dele):
    python3 carregar_nido_captadores.py            # só conta, não grava
    python3 carregar_nido_captadores.py --gravar   # troca o conteúdo da tabela (uma transação)
"""
import os, re, sys, collections
DUMP = os.path.expanduser('~/Downloads/nido-backup/exportacao/108/backup_2026-09-28.sql')
DSN = os.path.expanduser('~/.config/novasp/prod-pooler.dsn')

rx = re.compile(r"\('([^']*)','([^']*)','([^']*)',(?:NULL|'[^']*'),(\d+)\)")
por_imovel = collections.defaultdict(list)
with open(DUMP, encoding='utf-8', errors='replace') as f:
    for linha in f:
        if not linha.startswith('INSERT INTO `exporta_imovel_profissional`'):
            continue
        for chave_imovel, relacao, chave_prof, ordem in rx.findall(linha):
            if relacao == 'ANGARIADOR':
                por_imovel[chave_imovel].append((int(ordem), chave_prof.strip()))
print(f'{len(por_imovel):,} imóveis com captador no backup do Nido')

import psycopg2, psycopg2.extras
con = psycopg2.connect(open(DSN).read().strip())
with con.cursor() as cur:
    cur.execute('select chave_profissional, nome, nome_uso, equipe from nido_corretores')
    corretores = {r[0].strip(): r for r in cur.fetchall()}

def cap(s):
    s = ' '.join(str(s or '').split())
    return ' '.join(w if w.lower() in ('de', 'da', 'do', 'dos', 'das', 'e') else w[:1].upper() + w[1:].lower() for w in s.split(' '))

linhas, sem_nome = [], 0
for chave_imovel, lst in por_imovel.items():
    vistos, nomes, chaves = set(), [], []
    for _, cp in sorted(lst):
        if cp in vistos:
            continue
        vistos.add(cp); chaves.append(cp)
        c = corretores.get(cp)
        if c:
            nome = cap(c[1] or c[2] or cp)
            eq = (c[3] or '').strip()
            nomes.append(f'{nome} ({eq})' if eq else nome)
        else:
            sem_nome += 1; nomes.append(cp)
    linhas.append((chave_imovel, ' · '.join(nomes), chaves))
print(f'{len(linhas):,} linhas para gravar · {sem_nome:,} captadores sem cadastro no nido_corretores (fica a chave)')
print('exemplos:', [l[:2] for l in linhas[:3]])

if '--gravar' not in sys.argv:
    sys.exit('(sem --gravar: nada foi gravado)')
SQL = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'portal', 'sql', '2026-10-27-acervo-nido-captadores.sql')
with con, con.cursor() as cur:
    cur.execute("select to_regclass('public.nido_captadores')")
    if cur.fetchone()[0] is None:      # tabela ainda não criada: roda o SQL do repositório (mesma transação da carga)
        ddl = open(SQL, encoding='utf-8').read()
        ddl = ddl.replace('begin;', '').replace('commit;', '')
        ddl = ddl[:ddl.rfind("select 'ok")]
        cur.execute(ddl)
        print('Tabela nido_captadores e view nido_v_imoveis criadas.')
    cur.execute('truncate nido_captadores')
    psycopg2.extras.execute_values(cur, 'insert into nido_captadores (chave_imovel, captadores, chaves) values %s', linhas, page_size=2000)
    cur.execute("select count(*), pg_size_pretty(pg_total_relation_size('nido_captadores')), pg_size_pretty(pg_database_size(current_database())) from nido_captadores")
    n, tam, banco = cur.fetchone()
print(f'Gravado: {n:,} imóveis · tabela {tam} · banco {banco}')
