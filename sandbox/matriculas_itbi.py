#!/usr/bin/env python3
"""Matrícula e cartório de registro por contribuinte (SQL), tirados das guias de ITBI da Prefeitura (2010–2026).

Lê as planilhas da Fazenda que já estão em ~/Downloads/foca/dados/brutos-itbi/ (itbi-AAAA.xlsx e a publicação mais
recente de 2026) e guarda, para cada SQL, a matrícula e o cartório da guia MAIS RECENTE (a matrícula pode ter sido
aberta de novo, por unificação ou desdobro). Só leitura das planilhas; o resultado vai para um CSV local.

Uso:  python3 matriculas_itbi.py            → mede e grava sandbox/matriculas/matriculas_itbi.csv
"""
import csv, glob, os, re, sys, time
from datetime import datetime, date
import openpyxl

PASTA = os.path.expanduser('~/Downloads/foca/dados/brutos-itbi')
SAIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'matriculas')
os.makedirs(SAIDA, exist_ok=True)

arquivos = sorted(glob.glob(os.path.join(PASTA, 'itbi-20*.xlsx')))
r2026 = sorted(glob.glob(os.path.join(PASTA, 'guias-2026-*.xlsx')))
if r2026: arquivos.append(r2026[-1])                      # a publicação mais recente de 2026

def dt(v):
    if isinstance(v, datetime): return v.date()
    if isinstance(v, date): return v
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})', str(v or ''))
    return date(int(m[3]), int(m[2]), int(m[1])) if m else None

melhor = {}          # sql11 → (data, matricula, cartorio, cep)
linhas = 0; t0 = time.time()
for arq in arquivos:
    wb = openpyxl.load_workbook(arq, read_only=True, data_only=True)
    for ws in wb.worksheets:
        if not re.match(r'^[A-Z]{3}-\d{4}$', ws.title): continue
        it = ws.iter_rows(values_only=True)
        cab = [str(c or '').strip() for c in next(it, [])]
        try:
            i_sql = cab.index('N° do Cadastro (SQL)'); i_mat = cab.index('Matrícula do Imóvel')
            i_car = cab.index('Cartório de Registro'); i_dt = cab.index('Data de Transação'); i_cep = cab.index('CEP')
        except ValueError:
            continue
        for row in it:
            if not row or row[i_sql] is None: continue
            sql = re.sub(r'\D', '', str(row[i_sql])).zfill(11)
            mat = re.sub(r'\D', '', str(row[i_mat] or '')).lstrip('0')
            if len(sql) != 11 or not mat: continue
            linhas += 1
            car = str(row[i_car] or '').strip()
            d = dt(row[i_dt]); cep = re.sub(r'\D', '', str(row[i_cep] or ''))
            ant = melhor.get(sql)
            if ant is None or (d and (ant[0] is None or d >= ant[0])):
                melhor[sql] = (d, mat, car, cep)
    wb.close()
    print(f'{os.path.basename(arq)}: {linhas:,} guias lidas, {len(melhor):,} contribuintes · {time.time()-t0:.0f}s', flush=True)

zs = sum(1 for v in melhor.values() if v[3].startswith('04'))
cart = {}
for v in melhor.values(): cart[v[2]] = cart.get(v[2], 0) + 1
with open(os.path.join(SAIDA, 'matriculas_itbi.csv'), 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['sql', 'matricula', 'cartorio', 'data', 'cep'])
    for sql, (d, mat, car, cep) in melhor.items(): w.writerow([sql, mat, car, d.isoformat() if d else '', cep])
print(f'\nTOTAL: {len(melhor):,} contribuintes com matrícula (cidade) · {zs:,} com CEP 04 (Zona Sul e vizinhos)')
print('Cartórios (nomes como vêm na guia):', sorted(cart.items(), key=lambda x: -x[1])[:22])
print('CSV:', os.path.join(SAIDA, 'matriculas_itbi.csv'), f'{os.path.getsize(os.path.join(SAIDA, "matriculas_itbi.csv"))/1e6:.0f} MB')
