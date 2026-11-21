#!/usr/bin/env python3
"""Copia os chamados de MANUTENÇÃO da planilha (Apps Script) para manutencao_chamados (21/11/2026).

    python3 sandbox/migrar_manutencao.py            # só confere
    python3 sandbox/migrar_manutencao.py --gravar   # grava no banco de produção

Pode rodar de novo: só insere protocolos que ainda não existem (on conflict do nothing).
"Concluido" vira "Concluído". A planilha fica intacta como reserva.
"""
import json, os, re, sys, urllib.request, datetime

CFG = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'portal', 'js', '00-config.js')
GAS = re.search(r"GAS_MANUTENCAO\s*=\s*'([^']+)'", open(CFG, encoding='utf-8').read()).group(1)
MAPA = {'Protocolo': 'protocolo', 'Data': 'data', 'Nome': 'nome', 'Telefone': 'telefone', 'Email': 'email', 'Endereço': 'endereco',
        'Tipo Serviço': 'tipo_servico', 'Status': 'status', 'Responsabilidade': 'responsabilidade', 'Profissional': 'profissional',
        'Observações': 'observacoes', 'Valor': 'valor', 'Retorno 10%': 'retorno_10'}
COLS = list(MAPA.values())


def data_iso(v):
    s = str(v or '').strip()
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})T(\d{2})', s)
    if m:   # a planilha devolve meia-noite de SP em UTC (T03:00Z) → a data é a do próprio texto
        d = datetime.datetime(int(m[1]), int(m[2]), int(m[3]), int(m[4])) - datetime.timedelta(hours=3)
        return d.date().isoformat()
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', s)
    if m: return f'{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}'
    return None


def main():
    with urllib.request.urlopen(GAS + '?acao=listar_chamados', timeout=90) as r:
        d = json.loads(r.read())
    cab, linhas = d[0], d[1:]
    faltam = [h for h in MAPA if h not in cab]
    if faltam: sys.exit('Colunas que sumiram da planilha: %s' % faltam)
    regs, vistos, semdata = [], set(), 0
    for l in linhas:
        x = dict(zip(cab, l))
        p = str(x.get('Protocolo') or '').strip()
        if not p or p in vistos: continue
        vistos.add(p)
        reg = {MAPA[k]: ('' if x.get(k) is None else str(x.get(k)).strip()) for k in MAPA}
        reg['data'] = data_iso(x.get('Data'))
        if not reg['data']: semdata += 1; reg['data'] = datetime.date.today().isoformat()
        if reg['status'].lower() == 'concluido': reg['status'] = 'Concluído'
        if not reg['status']: reg['status'] = 'Aberto'
        m = re.search(r'Atendimento realizado por: ([^.]+)\.', reg['observacoes'])
        reg['aberto_por'] = m.group(1).strip() if m else ''
        regs.append(reg)
    print(f'Planilha: {len(linhas)} linhas, {len(regs)} chamados com protocolo ({semdata} sem data → hoje).')
    if '--gravar' not in sys.argv:
        print('Só conferência. Para gravar: --gravar'); return
    try:
        import psycopg2
    except ImportError:
        import site; sys.path.append(site.getusersitepackages()); import psycopg2
    con = psycopg2.connect(open(os.path.expanduser('~/.config/novasp/prod-pooler.dsn')).read().strip())
    cur = con.cursor(); n = 0
    cols = COLS + ['aberto_por']
    for r in regs:
        cur.execute(f"insert into manutencao_chamados ({', '.join(cols)}) values ({', '.join(['%s'] * len(cols))}) on conflict (protocolo) do nothing",
                    [r[c] for c in cols])
        n += cur.rowcount
    con.commit()
    cur.execute('select count(*) from manutencao_chamados'); t = cur.fetchone()[0]
    print(f'Gravado: {n} chamados novos. No banco agora: {t}.')


if __name__ == '__main__':
    main()
