#!/usr/bin/env python3
"""Copia os processos de ENTREGA DE CHAVES da planilha (Apps Script) para chaves_processos (23/11/2026).
Tenta ligar cada processo ao contrato do Imoview (imoview_contratos, carregado antes por sync_imoview_cache.py) pelo
nome do locatário e pelo endereço — só quando há UM contrato que bate.

    python3 sandbox/migrar_entrega_chaves.py            # só confere
    python3 sandbox/migrar_entrega_chaves.py --gravar   # grava (só protocolos que ainda não existem)
"""
import json, os, re, sys, unicodedata, urllib.request, datetime

PAINEL = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'portal', 'entregaapp', 'painel.html')
GAS = re.search(r"var SURL='([^']+)'", open(PAINEL, encoding='utf-8').read()).group(1)
TXT = {'Locador': 'locador', 'Email Locador': 'email_locador', 'Locatário': 'locatario', 'Email Locatário': 'email_locatario', 'Endereço': 'endereco',
       'Tipo Fiança': 'tipo_fianca', 'Status': 'status', 'Necessita Reparo': 'necessita_reparo', 'Descrição Reparo': 'descricao_reparo',
       'Valor Reparo': 'valor_reparo', 'Responsável Reparo': 'responsavel_reparo', 'Observações': 'observacoes'}
DAT = {'Data Cadastro': 'data_cadastro', 'Data Agendada': 'data_agendada', 'Data Entrega': 'data_entrega', 'Data Vistoria': 'data_vistoria',
       'Data Débitos': 'data_debitos', 'Data Liberação': 'data_liberacao', 'Data Devolução': 'data_devolucao', 'Data Resgate': 'data_resgate',
       'Data Sinistro': 'data_sinistro'}

def dia(v):
    s = str(v or '').strip()
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})', s)
    if m:   # a planilha devolve horário de SP em UTC
        return (datetime.datetime(*map(int, m.groups())) - datetime.timedelta(hours=3)).date().isoformat()
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})', s)
    return f'{m[3]}-{int(m[2]):02d}-{int(m[1]):02d}' if m else None

nn = lambda s: {w for w in unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().upper().replace(',', ' ').split() if len(w) > 2}

def main():
    with urllib.request.urlopen(GAS + '?acao=listar', timeout=90) as r:
        d = json.loads(r.read())
    cab, linhas = d[0], d[1:]
    falta = [h for h in list(TXT) + list(DAT) + ['Protocolo'] if h not in cab]
    if falta: sys.exit('Colunas que sumiram: %s' % falta)
    gravar = '--gravar' in sys.argv
    try:
        import psycopg2
    except ImportError:
        import site; sys.path.append(site.getusersitepackages()); import psycopg2
    con = psycopg2.connect(open(os.path.expanduser('~/.config/novasp/prod-pooler.dsn')).read().strip()); cur = con.cursor()
    cur.execute('select codigo, locatario_nome, endereco from imoview_contratos'); ctr = cur.fetchall()
    regs, vistos, ligados = [], set(), 0
    for l in linhas:
        x = dict(zip(cab, l)); p = str(x.get('Protocolo') or '').strip()
        if not p or p in vistos: continue
        vistos.add(p)
        r = {v: ('' if x.get(k) is None else str(x.get(k)).strip()) for k, v in TXT.items()}
        r.update({v: dia(x.get(k)) for k, v in DAT.items()})
        r['protocolo'] = p; r['data_cadastro'] = r['data_cadastro'] or datetime.date.today().isoformat()
        a, e = nn(r['locatario']), nn(r['endereco'])
        cand = {c for c, ln, en in ctr if (a and len(a & nn(ln)) >= 2) and (not e or len(e & nn(en)) >= 2)}
        r['contrato_imoview'] = cand.pop() if len(cand) == 1 else None
        ligados += r['contrato_imoview'] is not None
        regs.append(r)
    print(f'Planilha: {len(linhas)} linhas, {len(regs)} processos; ligados a contrato do Imoview: {ligados}.')
    if not gravar: print('Só conferência. Para gravar: --gravar'); return
    cols = list(regs[0].keys()); n = 0
    for r in regs:
        cur.execute(f"insert into chaves_processos ({', '.join(cols)}, criado_por) values ({', '.join(['%s'] * len(cols))}, 'planilha') on conflict (protocolo) do nothing", [r[c] for c in cols])
        if cur.rowcount:
            n += 1
            cur.execute("insert into chaves_andamentos (protocolo, etapa, mensagem, autor) values (%s, %s, %s, 'planilha')",
                        (r['protocolo'], r['status'], 'Processo trazido da planilha antiga (sem histórico anterior).'))
    con.commit(); cur.execute('select count(*) from chaves_processos')
    print(f'Gravado: {n} processos novos. No banco agora: {cur.fetchone()[0]}.')

if __name__ == '__main__':
    main()
