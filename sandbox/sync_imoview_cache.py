#!/usr/bin/env python3
"""Cópia leve de contratos de locação e pessoas do Imoview para o banco (imoview_contratos / imoview_pessoas) — 23/11/2026.
Usada pela Entrega de chaves (cadastro pelo código do contrato e "rescisões sem processo").
A carga inicial roda aqui (demora ~20 min, 17 mil pessoas a 20 por página); depois a função falcaovaz imoview-sync mantém atualizado de hora em hora.

    python3 sandbox/sync_imoview_cache.py            # só conta o que viria
    python3 sandbox/sync_imoview_cache.py --gravar   # grava tudo (carga completa)
"""
import json, os, re, subprocess, sys, time, urllib.request, datetime

def chave():
    return subprocess.run(['security', 'find-generic-password', '-s', 'imoview', '-a', 'nsp', '-w'], capture_output=True, text=True).stdout.strip()

def get(k, path):
    for t in range(5):
        try:
            req = urllib.request.Request('https://api.imoview.com.br/' + path, headers={'chave': k, 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=180) as r: return json.loads(r.read())
        except Exception as e:
            err = e; time.sleep(3 + 5 * t)
    raise err

def data(s):
    m = re.match(r'^(\d{2})/(\d{2})/(\d{4})', s or '')
    return f'{m[3]}-{m[2]}-{m[1]}' if m else None

def contrato(m):
    im = (m.get('imoveis') or [{}])[0] or {}
    return {'codigo': m['codigo'], 'codigo_auxiliar': (m.get('codigoauxiliar') or '').strip(), 'situacao': m.get('situacao') or '',
            'locatario_codigo': m.get('locatariocodigo'), 'locatario_nome': m.get('locatarionome') or '', 'locatario_email': (m.get('locatarioemail') or '').strip(),
            'endereco': im.get('endereco') or '', 'garantia': m.get('garantia') or '',
            'locadores': json.dumps([{'codigo': l.get('codigo'), 'nome': l.get('nome')} for i in (m.get('imoveis') or []) for l in (i.get('locadores') or [])], ensure_ascii=False),
            'data_inicio': data(m.get('datainicio')), 'data_aviso_desocupacao': data(m.get('dataavisodesocupacao')),
            'data_previsao_rescisao': data(m.get('dataprevisaorescisao')), 'data_rescisao': data(m.get('datarescisao')), 'motivo_rescisao': m.get('motivorescisao') or ''}

def pessoa(c):
    em = ', '.join(dict.fromkeys(e.get('email', '').strip() for e in (c.get('emails') or []) if '@' in (e.get('email') or '')))
    return {'codigo': c['codigo'], 'nome': c.get('nome') or '', 'emails': em}

def paginas(k, base, f, n=50):
    out, p = [], 1
    while True:
        d = get(k, f'{base}&numeroPagina={p}&numeroRegistros={n}')
        out += [f(x) for x in d.get('lista') or []]
        if len(d.get('lista') or []) < n: return out
        p += 1
        if p % 50 == 0: print(f'  … {len(out)}', flush=True)

def main():
    k = chave(); inicio = datetime.datetime.now(datetime.timezone.utc)
    cs = paginas(k, 'ContratoAluguel/RetornarContratos?ordenacao=1', contrato); print('contratos', len(cs))
    ps = paginas(k, 'Cliente/RetornarClientes?tipoRelacionamento=2', pessoa, 20)   # clientes: no máximo 20 por página; print('pessoas', len(ps), 'com e-mail', sum(1 for p in ps if p['emails']))
    if '--gravar' not in sys.argv: print('Só conferência. Para gravar: --gravar'); return
    try:
        import psycopg2, psycopg2.extras
    except ImportError:
        import site; sys.path.append(site.getusersitepackages()); import psycopg2, psycopg2.extras
    con = psycopg2.connect(open(os.path.expanduser('~/.config/novasp/prod-pooler.dsn')).read().strip()); cur = con.cursor()
    for tab, regs, pk in (('imoview_contratos', cs, 'codigo'), ('imoview_pessoas', ps, 'codigo')):
        cols = list(regs[0].keys())
        sql = f"insert into {tab} ({', '.join(cols)}, atualizado_em) values %s on conflict ({pk}) do update set " + ', '.join(f'{c}=excluded.{c}' for c in cols if c != pk) + ', atualizado_em=now()'
        psycopg2.extras.execute_values(cur, sql, [tuple(r[c] for c in cols) + (datetime.datetime.now(datetime.timezone.utc),) for r in regs], page_size=500)
    for ch in ('contratos', 'pessoas'):
        cur.execute("insert into imoview_sync_estado (chave, ultimo) values (%s, %s) on conflict (chave) do update set ultimo=excluded.ultimo", (ch, inicio))
    con.commit()
    cur.execute('select (select count(*) from imoview_contratos), (select count(*) from imoview_pessoas)'); print('Gravado. No banco: %s contratos, %s pessoas.' % cur.fetchone())

if __name__ == '__main__':
    main()
