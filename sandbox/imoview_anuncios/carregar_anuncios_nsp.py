#!/usr/bin/env python3
"""Cópia diária dos anúncios da Nova SP (Imoview) para a avaliação do portal.

Lê os imóveis DISPONÍVEIS À VENDA no Imoview (Imovel/RetornarImoveisDisponiveis, 20 por página) e
grava em aval_anuncios_nsp (sql/2026-10-06-aval-anuncios-nsp.sql) só o que a avaliação usa: tipo,
bairro, rua, área, valor, dormitórios, vagas e coordenadas. Proprietário, número e complemento NÃO saem daqui.

Uso (Rodrigo, no terminal dele):
    python3 carregar_anuncios_nsp.py            # só baixa e mostra os totais (não grava)
    python3 carregar_anuncios_nsp.py --gravar   # baixa e troca o conteúdo da tabela (uma transação)

Chave do Imoview: variável IMOVIEW_KEY ou Chaveiro do macOS (serviço imoview, conta nsp), igual à sonda do site.
Banco: ~/.config/novasp/prod-pooler.dsn.
Trava: se vierem menos de 70% dos anúncios que a API diz ter, não grava (a tabela antiga fica).
"""
import json, os, re, sys, time, unicodedata, urllib.request, urllib.error, subprocess
from collections import Counter

KEY = os.environ.get('IMOVIEW_KEY', '').strip()
if not KEY:
    KEY = subprocess.run(['security', 'find-generic-password', '-s', 'imoview', '-a', 'nsp', '-w'],
                         capture_output=True, text=True).stdout.strip()
if not KEY:
    sys.exit('ERRO: chave do Imoview não encontrada (IMOVIEW_KEY ou Chaveiro: serviço imoview, conta nsp).')

BASE = 'https://api.imoview.com.br/'
POR_PAGINA = 20                     # a API recusa mais que 20 ("Nº de registros não pode ser maior que 20!")


def chamar(pagina):
    corpo = json.dumps({'finalidade': 2, 'numeroPagina': pagina, 'numeroRegistros': POR_PAGINA}).encode()
    req = urllib.request.Request(BASE + 'Imovel/RetornarImoveisDisponiveis', data=corpo, method='POST',
                                 headers={'chave': KEY, 'Content-Type': 'application/json', 'Accept': 'application/json'})
    for tentativa in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode('utf-8', 'replace'))
        except (urllib.error.URLError, TimeoutError) as e:
            if tentativa == 2:
                raise
            time.sleep(3)


def sem_acento(s):
    return unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().upper().strip()


GRUPOS = {
    'apto': {'APARTAMENTO', 'COBERTURA', 'DUPLEX', 'TRIPLEX', 'FLAT', 'KIT', 'KITNET', 'STUDIO', 'PENTHOUSE', 'GARDEN', 'AREA PRIVATIVA'},
    'casa': {'CASA', 'CASA ASSOBRADADA', 'CASA DE VILA', 'CASA TERREA', 'SOBRADO', 'CONDOMINIO'},
    'com': {'ANDAR CORRIDO', 'COMERCIAL', 'CONJ. COMERCIAL', 'GALPAO', 'LOJA', 'PONTO COMERCIAL', 'PREDIO', 'SALA', 'SALAO'},
    'terreno': {'AREA', 'LOTE', 'LOTE EM CONDOMINIO', 'TERRENO'},
}


def grupo(tipo):
    t = sem_acento(tipo)
    return next((g for g, tipos in GRUPOS.items() if t in tipos), 'outro')


def num(v):
    """'R$ 618.000,00' → 618000.0 · '32,00' → 32.0 · '-23.55' → -23.55"""
    if v is None or v is False:
        return None
    s = str(v).replace('R$', '').strip()
    if ',' in s:
        s = s.replace('.', '').replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None


def inteiro(v):
    n = num(v)
    return int(n) if n is not None else None


def data_br(v):
    """'23/09/2026 17:09:03' → '2026-09-23T17:09:03-03:00' (o Postgres leria dd/mm como mm/dd)"""
    m = re.match(r'(\d{2})/(\d{2})/(\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)', str(v or ''))
    return f'{m.group(3)}-{m.group(2)}-{m.group(1)}T{m.group(4)}-03:00' if m else None


def linha(it):
    lat, lng, valor, area = num(it.get('latitude')), num(it.get('longitude')), num(it.get('valor')), num(it.get('areaprincipal'))
    if not (lat and lng and valor and area) or not (-24.1 < lat < -23.3 and -47.0 < lng < -46.3):
        return None
    rua = re.sub(r'\s+', ' ', str(it.get('endereco') or '')).strip() or None
    return {'codigo': int(it['codigo']), 'ref': it.get('codigoauxiliar') or None, 'tipo': it.get('tipo'), 'grupo': grupo(it.get('tipo')),
            'bairro': it.get('bairro'), 'rua': rua, 'area': area, 'terreno': num(it.get('arealote')), 'valor': valor,
            'dorm': inteiro(it.get('numeroquartos')), 'vaga': inteiro(it.get('numerovagas')), 'lat': lat, 'lng': lng,
            'alterado_em': data_br(it.get('datahoraultimaalteracao'))}


def main():
    gravar = '--gravar' in sys.argv
    primeira = chamar(1)
    resp = primeira.get('resposta') or {}
    total = int(resp.get('quantidade') or 0)
    paginas = (total + POR_PAGINA - 1) // POR_PAGINA
    print(f'Imoview: {total} imóveis disponíveis à venda · {paginas} páginas')
    brutos, vistos = list(resp.get('lista') or []), set()
    for p in range(2, paginas + 1):
        r = (chamar(p).get('resposta') or {}).get('lista') or []
        brutos.extend(r)
        if p % 50 == 0:
            print(f'  página {p}/{paginas} · {len(brutos)} lidos')
        time.sleep(0.15)
    linhas = []
    for it in brutos:
        if it.get('codigo') in vistos:
            continue
        vistos.add(it.get('codigo'))
        l = linha(it)
        if l:
            linhas.append(l)
    print(f'Lidos {len(vistos)} · com coordenada, área e valor: {len(linhas)}')
    print('Por grupo:', dict(Counter(l['grupo'] for l in linhas)))
    print('Bairros com mais anúncios:', Counter(l['bairro'] for l in linhas).most_common(8))
    if not gravar:
        print('\n(sem --gravar: nada foi gravado)')
        return
    if total == 0 or len(vistos) < 0.7 * total:
        sys.exit(f'NÃO GRAVEI: vieram {len(vistos)} de {total}. A tabela antiga continua.')

    import psycopg2, psycopg2.extras
    con = psycopg2.connect(open(os.path.expanduser('~/.config/novasp/prod-pooler.dsn')).read().strip())
    with con, con.cursor() as cur:
        cur.execute('delete from aval_anuncios_nsp')
        psycopg2.extras.execute_values(cur, """
            insert into aval_anuncios_nsp (codigo, ref, tipo, grupo, bairro, rua, area, terreno, valor, dorm, vaga, lat, lng, alterado_em)
            values %s""", [(l['codigo'], l['ref'], l['tipo'], l['grupo'], l['bairro'], l['rua'], l['area'], l['terreno'], l['valor'],
                            l['dorm'], l['vaga'], l['lat'], l['lng'], l['alterado_em']) for l in linhas], page_size=500)
        cur.execute('select count(*), max(carregado_em) from aval_anuncios_nsp')
        n, quando = cur.fetchone()
    print(f'Gravado: {n} anúncios em aval_anuncios_nsp ({quando:%d/%m/%Y %H:%M}).')


if __name__ == '__main__':
    main()
