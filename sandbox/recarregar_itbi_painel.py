#!/usr/bin/env python3
"""Recarrega o aval_itbi_painel (reserva da avaliação: comparáveis por BAIRRO, usados só quando a busca por raio
não acha venda perto) a partir do itbi_painel.csv do Foca (08/11/2026).

- Bairro = coluna "Bairro" da Prefeitura; quando vazia, o bairro de guia do Foca (coluna "guia"). Sem nenhum dos dois, a linha fica fora.
- Antes de trocar, salva a tabela atual em sandbox/aval_itbi_painel_backup_AAAAMMDD-HHMMSS.csv (para desfazer).
- Na mesma transação, fecha aval_itbi_painel e aval_geo_ref para a chave pública: RLS ligado e sem permissão direta
  para anon/authenticated. Quem lê as duas são as funções aval_comps_itbi e aval_geocode (security definer, dono postgres),
  que continuam funcionando. Nenhum código do portal, do site ou do NSP Intelligence lê as tabelas direto.

Uso:  python3 sandbox/recarregar_itbi_painel.py [ARQ.csv]            → só mostra o que faria
      python3 sandbox/recarregar_itbi_painel.py [ARQ.csv] --gravar   → grava
ARQ padrão: ~/Downloads/foca/dados/itbi_painel.csv
"""
import csv, io, os, sys, time, unicodedata
import psycopg2

args = [a for a in sys.argv[1:] if not a.startswith('--')]
GRAVAR = '--gravar' in sys.argv
ARQ = os.path.expanduser(args[0] if args else '~/Downloads/foca/dados/itbi_painel.csv')
AQUI = os.path.dirname(os.path.abspath(__file__))


def norm(s):
    s = unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode()
    return ' '.join(s.upper().split())


def num(s):
    try:
        return float(str(s).strip()) if str(s).strip() else None
    except ValueError:
        return None


linhas, sem_bairro, sem_data, de_guia = [], 0, 0, 0
with open(ARQ, encoding='utf-8') as f:
    for x in csv.DictReader(f):
        d = (x.get('Data de Transação') or '')[:10]
        if len(d) != 10 or d[4] != '-':
            sem_data += 1; continue
        b = (x.get('Bairro') or '').strip()
        if not b:
            b = (x.get('guia') or '').strip()
            if b: de_guia += 1
        if not b:
            sem_bairro += 1; continue
        cep = ''.join(ch for ch in str(x.get('cep') or '') if ch.isdigit())
        linhas.append((x.get('N° do Cadastro (SQL)') or '', x.get('Nome do Logradouro') or '', x.get('Número') or '', b.upper(), norm(b),
                       cep.zfill(8) if cep else '', x.get('Natureza de Transação') or '', num(x.get('Valor de Transação (declarado pelo contribuinte)')),
                       d, num(x.get('Área Construída (m2)')), x.get('Descrição do uso (IPTU)') or ''))

datas = sorted(l[8] for l in linhas)
print(f'Arquivo: {ARQ}')
print(f'Linhas que entram: {len(linhas):,} (bairro da Prefeitura: {len(linhas) - de_guia:,}; bairro de guia: {de_guia:,}) · '
      f'fora: {sem_bairro:,} sem bairro, {sem_data:,} sem data · período {datas[0] if datas else "-"} a {datas[-1] if datas else "-"}')
if not linhas:
    sys.exit('Nada para carregar: a tabela não foi tocada.')

con = psycopg2.connect(open(os.path.expanduser('~/.config/novasp/prod-pooler.dsn')).read().strip(), connect_timeout=30)
cur = con.cursor()
cur.execute('select count(*), max(data) from aval_itbi_painel')
n0, max0 = cur.fetchone()
print(f'Hoje no banco: {n0:,} linhas, até {max0}')
if not GRAVAR:
    print('Simulação: nada gravado. Rode de novo com --gravar.')
    sys.exit(0)

# 1) cópia da tabela atual (para desfazer)
bkp = os.path.join(AQUI, 'aval_itbi_painel_backup_' + time.strftime('%Y%m%d-%H%M%S') + '.csv')
with open(bkp, 'w', encoding='utf-8') as f:
    cur.copy_expert('copy (select sql, logradouro, numero, bairro, bairro_norm, cep, natureza, valor, data, area_constr, uso from aval_itbi_painel order by id) to stdout with csv header', f)
print(f'Cópia da tabela atual: {bkp}')

# 2) troca + fechamento, tudo numa transação
buf = io.StringIO(); w = csv.writer(buf)
for l in linhas: w.writerow(['' if v is None else v for v in l])
buf.seek(0)
try:
    cur.execute('create temp table _novo (sql text, logradouro text, numero text, bairro text, bairro_norm text, cep text, natureza text, valor numeric, data date, area_constr numeric, uso text) on commit drop')
    cur.copy_expert("copy _novo from stdin with (format csv, null '')", buf)
    cur.execute('truncate aval_itbi_painel restart identity')
    cur.execute('insert into aval_itbi_painel (sql, logradouro, numero, bairro, bairro_norm, cep, natureza, valor, data, area_constr, uso) select * from _novo')
    for t in ('aval_itbi_painel', 'aval_geo_ref'):
        cur.execute(f'alter table {t} enable row level security')
        cur.execute(f'revoke all on {t} from anon, authenticated')
    cur.execute('select count(*), min(data), max(data) from aval_itbi_painel')
    n1, min1, max1 = cur.fetchone()
    con.commit()
except Exception:
    con.rollback(); print('ERRO: nada foi alterado (transação desfeita).'); raise
print(f'Gravado: {n1:,} linhas, de {min1} a {max1}. aval_itbi_painel e aval_geo_ref fechadas para a chave pública.')
cur.execute("select count(*) from aval_comps_itbi('Moema', 20)")
print(f'Teste da função de reserva (Moema): {cur.fetchone()[0]} comparáveis')
