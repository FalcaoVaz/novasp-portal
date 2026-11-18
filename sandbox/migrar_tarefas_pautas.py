#!/usr/bin/env python3
"""Copia TAREFAS e as abas PAUTA_* da planilha (Apps Script do Calendar) para calendar_tarefas / calendar_pauta (18/11/2026).

    python3 -I sandbox/migrar_tarefas_pautas.py            # só confere: lê a planilha e mostra o que faria
    python3 -I sandbox/migrar_tarefas_pautas.py --gravar   # grava no banco de produção

Pode rodar de novo: só insere o que ainda não existe (on conflict do nothing) — não desfaz o que já foi editado no portal.
Ids repetidos na planilha (2 casos em TAREFAS) ganham id+1 na cópia.
A planilha fica intacta como reserva.
"""
import json, os, sys, urllib.request
import psycopg2

GAS = 'https://script.google.com/macros/s/AKfycbzvYElSoSN_rBikiur2Z-kgDF06xt8lvL-F6BfahfayyHKMWPUzqe78_s4h1YjK-0Q/exec'
PAUTAS = ['PAUTA_TERCA', 'PAUTA_QUARTA', 'PAUTA_JURIDICO', 'PAUTA_FELIPPE', 'PAUTA_EMILIA', 'PAUTA_RENATA', 'PAUTA_CHRISTIANE']
COL_T = ['titulo', 'status', 'prazo', 'prioridade', 'responsavel', 'delegar_para', 'categoria', 'observacoes',
         'data_criacao', 'semana_conclusao', 'data_conclusao', 'comentario']
COL_P = ['data_reuniao', 'item', 'responsavel', 'status', 'comentario', 'data_conclusao']


def ler(aba):
    with urllib.request.urlopen(f'{GAS}?action=read&sheet={aba}', timeout=90) as r:
        d = json.loads(r.read())
    if not d.get('success'):
        return None                                     # aba não existe (ex.: PAUTA_JURIDICO)
    rows = d.get('data') or []
    if rows and isinstance(rows[0], list):
        rows = [dict(zip(rows[0], x)) for x in rows[1:]]
    return rows


def txt(v):
    return '' if v is None else str(v)


def ids_unicos(rows):
    vistos, out = set(), []
    for r in rows:
        i = int(r['id'])
        while i in vistos:
            i += 1
        vistos.add(i)
        out.append((i, r))
    return out


def main():
    gravar = '--gravar' in sys.argv
    tarefas = ler('TAREFAS') or []
    pautas = {a: ler(a) for a in PAUTAS}
    print(f'TAREFAS: {len(tarefas)}')
    for a, rows in pautas.items():
        print(f'{a}: {"(aba não existe)" if rows is None else len(rows)}')
    if not gravar:
        print('\nSó conferência. Para gravar: --gravar')
        return
    dsn = open(os.path.expanduser('~/.config/novasp/prod-pooler.dsn')).read().strip()
    con = psycopg2.connect(dsn)
    cur = con.cursor()
    nt = np_ = 0
    for i, r in ids_unicos(tarefas):
        cur.execute(f"insert into calendar_tarefas (id, {', '.join(COL_T)}) values (%s{', %s' * len(COL_T)}) on conflict (id) do nothing",
                    [i] + [txt(r.get(c)) for c in COL_T])
        nt += cur.rowcount
    for aba, rows in pautas.items():
        for i, r in ids_unicos(rows or []):
            cur.execute(f"insert into calendar_pauta (id, reuniao, {', '.join(COL_P)}) values (%s, %s{', %s' * len(COL_P)}) on conflict (id) do nothing",
                        [i, aba] + [txt(r.get(c)) for c in COL_P])
            np_ += cur.rowcount
    con.commit()
    cur.execute("select (select count(*) from calendar_tarefas), (select count(*) from calendar_pauta)")
    t, p = cur.fetchone()
    print(f'\nGravado: {nt} tarefas novas, {np_} itens de pauta novos. No banco agora: {t} tarefas, {p} itens de pauta.')


if __name__ == '__main__':
    main()
