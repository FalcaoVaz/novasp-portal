#!/usr/bin/env python3
"""
Carrega o SANDBOX a partir do backup diário, MASCARANDO dados de terceiros
(nome de proprietário, cliente, partes de processo, contatos). Nomes de
funcionários (staff) são mantidos — o app precisa deles pra ser testável e
são dados internos.

Pré-requisitos:
  1. Projeto sandbox criado no Supabase (painel).
  2. Schema aplicado lá:  psql "$SANDBOX_DSN" -f 01-schema.sql   (ou colar no SQL Editor)
  3. DSN direto do sandbox exportado:
       export SANDBOX_DSN="postgresql://postgres:SENHA@db.XXXX.supabase.co:5432/postgres"

Uso:
  python3 carregar_sandbox.py                      # usa o backup mais recente
  python3 carregar_sandbox.py --backup ~/Backups/novasp/2026-09-13
  python3 carregar_sandbox.py --dry-run            # mostra amostra mascarada, não grava

O que NÃO vem: as tabelas aval_* do módulo de avaliação (não estão no backup).
"""
import argparse, glob, hashlib, json, os, sys, re
import psycopg2, psycopg2.extras

# ── mapa de mascaramento: tabela → {coluna: tipo} ───────────────────────
# Só dados de TERCEIROS. Staff (usuarios.nome, vendas_corretores.nome, autor_nome
# do fórum, corretor_nome, votante_nome…) fica como está de propósito.
# Para mascarar também endereços/staff, é só acrescentar aqui.
MASK = {
    'acordos_extrajudiciais': {'proprietario': 'nome'},
    'processos':              {'autor': 'nome', 'reu': 'nome',
                               'nome_cliente': 'nome', 'email_cliente': 'email'},
    'chamados_manutencao':    {'telefone': 'fone'},
    'vendas_agenda_fotografo':{'telefone': 'fone'},
}

def _h(v, mod=100000):
    return int(hashlib.md5(str(v).encode()).hexdigest(), 16) % mod

def _mask(valor, tipo):
    if valor in (None, ''):
        return valor
    h = _h(valor)
    if tipo == 'nome':
        return f'Contato Mascarado {h:05d}'
    if tipo == 'email':
        return f'mascarado{h:05d}@exemplo.invalid'
    if tipo == 'fone':
        return f'(11) 9{h % 10000:04d}-{_h(valor,10000):04d}'
    return valor

def mascara_linha(tabela, row):
    regras = MASK.get(tabela)
    if not regras:
        return row
    out = dict(row)
    for col, tipo in regras.items():
        if col in out:
            out[col] = _mask(out[col], tipo)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--backup', default=None)
    ap.add_argument('--dsn', default=os.environ.get('SANDBOX_DSN'))
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()

    backup = a.backup or sorted(glob.glob(os.path.expanduser('~/Backups/novasp/*/')))[-1]
    arquivos = sorted(glob.glob(os.path.join(backup, '*.json')))
    print(f'backup: {backup}  ({len(arquivos)} tabelas)')

    if a.dry_run:
        for f in arquivos:
            t = os.path.basename(f)[:-5]
            if t not in MASK:
                continue
            dados = json.load(open(f))
            if not dados:
                continue
            print(f'\n== {t} — antes/depois (1ª linha) ==')
            antes = {k: dados[0][k] for k in MASK[t] if k in dados[0]}
            print('  antes: ', antes)
            print('  depois:', {k: mascara_linha(t, dados[0])[k] for k in MASK[t] if k in dados[0]})
        return

    if not a.dsn:
        sys.exit('defina SANDBOX_DSN (DSN direto do projeto sandbox) ou passe --dsn')
    if 'mqcduyvpuxdweqesgwrq' in a.dsn:
        sys.exit('ERRO DE SEGURANÇA: esse DSN é da PRODUÇÃO. Use o DSN do SANDBOX.')

    con = psycopg2.connect(a.dsn); con.autocommit = False
    cur = con.cursor()
    cur.execute("set session_replication_role = 'replica';")   # desliga FK durante a carga
    total = 0
    for f in arquivos:
        t = os.path.basename(f)[:-5]
        dados = json.load(open(f))
        if not dados:
            continue
        cols = list(dados[0].keys())
        cur.execute(f'truncate table {t} cascade;')
        linhas = [mascara_linha(t, r) for r in dados]
        vals = [[r.get(c) for c in cols] for r in linhas]
        collist = ','.join(f'"{c}"' for c in cols)
        psycopg2.extras.execute_values(
            cur, f'insert into {t} ({collist}) values %s', vals, page_size=1000)
        total += len(vals)
        print(f'  {t:34} {len(vals):>5} linhas' + ('  · mascarada' if t in MASK else ''))
    cur.execute("set session_replication_role = 'origin';")
    # reajusta sequences (ids inseridos explicitamente)
    cur.execute("""select seqrelid::regclass::text, refobjid::regclass::text, a.attname
                   from pg_depend d join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid
                   join pg_class s on s.oid=d.seqrelid
                   where d.deptype='a'""")
    for seq, tab, col in cur.fetchall():
        try:
            cur.execute(f'select setval(%s, coalesce((select max("{col}") from {tab}),1))', (seq,))
        except Exception:
            con.rollback()
    con.commit()
    print(f'\nOK — {total} linhas carregadas no sandbox (terceiros mascarados; staff preservado).')
    con.close()


if __name__ == '__main__':
    main()
