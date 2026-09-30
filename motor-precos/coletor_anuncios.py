#!/usr/bin/env python3
"""
Coletor de anúncios SOB DEMANDA (concorrência viva + preço de lançamento).
Portais acessíveis (testados 13/09/2026): QuintoAndar (JSON __NEXT_DATA__),
Chaves na Mão (JSON-LD). Os grandes (VivaReal/ZAP/OLX) dão 403 direto.

Uso:
    from coletor_anuncios import busca_quintoandar
    anuncios = busca_quintoandar('moema-sao-paulo-sp-brasil')
"""
import re, json, urllib.request

UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/128.0 Safari/537.36')

def _fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', 'ignore')

def busca_quintoandar(regiao_slug, so_venda=True):
    """regiao_slug ex.: 'moema-sao-paulo-sp-brasil'. Retorna lista normalizada."""
    html = _fetch(f'https://www.quintoandar.com.br/comprar/imovel/{regiao_slug}')
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return []
    d = json.loads(m.group(1))
    def walk(o):
        if isinstance(o, dict):
            if 'salePrice' in o and 'area' in o:
                yield o
            for v in o.values():
                yield from walk(v)
        elif isinstance(o, list):
            for x in o:
                yield from walk(x)
    out = []
    vistos = set()
    for it in walk(d):
        if so_venda and not it.get('forSale'):
            continue
        preco = it.get('salePrice'); area = it.get('area')
        if not preco or not area or area <= 0:
            continue
        iid = it.get('id')
        if iid in vistos:
            continue
        vistos.add(iid)
        out.append({
            'portal': 'quintoandar',
            'url': f'https://www.quintoandar.com.br/imovel/{iid}',
            'preco': preco, 'area': area,
            'rs_m2': round(preco / area),
            'dorm': it.get('bedrooms'), 'banho': it.get('bathrooms'),
            'vaga': it.get('parkingSpots'), 'condo_iptu': it.get('condoIptu'),
            'rua': (it.get('address') or {}).get('address'),
            'bairro': it.get('neighbourhood') or it.get('regionName'),
            'tipo': it.get('type'),
            'lancamento': bool(it.get('isPrimaryMarket')),
        })
    return out

if __name__ == '__main__':
    import sys, statistics
    slug = sys.argv[1] if len(sys.argv) > 1 else 'moema-sao-paulo-sp-brasil'
    anuncios = busca_quintoandar(slug)
    print(f'{len(anuncios)} anúncios de venda em {slug}')
    usados = [a['rs_m2'] for a in anuncios if not a['lancamento']]
    lanc = [a['rs_m2'] for a in anuncios if a['lancamento']]
    if usados: print(f'  USADOS: {len(usados)} anúncios · R$/m² mediano {statistics.median(usados):,.0f}')
    if lanc: print(f'  LANÇAMENTO: {len(lanc)} anúncios · R$/m² mediano {statistics.median(lanc):,.0f}')
    for a in anuncios[:4]:
        tag = ' [LANÇAMENTO]' if a['lancamento'] else ''
        print(f"   {a['tipo']} {a['area']}m² {a['dorm']}dorm · R$ {a['preco']:,} (R${a['rs_m2']:,}/m²) · {a['rua']}{tag}")


def busca_chavesnamao_lancamentos(bairro_slug, cidade_slug='sp-sao-paulo'):
    """Lançamentos anunciados no Chaves na Mão por bairro (página pública, server-rendered).
    bairro_slug ex.: 'moema'. Devolve lista normalizada só com anúncios de lançamento
    (URL /lancamento/...). Área e preço vêm do card; em empreendimento com várias
    plantas o card traz a maior unidade e o preço dela — serve como mediana de bairro,
    não como preço de uma planta específica."""
    import html as _h
    url = f'https://www.chavesnamao.com.br/lancamentos/{cidade_slug}/{bairro_slug}/'
    try:
        page = _fetch(url)
    except Exception:
        return []
    txt = page.replace('\\"', '"').replace('\\/', '/')
    out, vistos = [], set()
    for m in re.finditer(r'"listingPreview":(\{.*?\})\s*,\s*"singleProperty"', txt):
        try:
            it = json.loads(m.group(1))
        except Exception:
            continue
        u = it.get('url') or ''
        if '/lancamento/' not in u or it.get('id') in vistos:
            continue
        vistos.add(it.get('id'))
        try:
            area = float(str(it.get('area') or '0').replace(',', '.'))
            preco = float(it.get('price') or 0)
        except ValueError:
            continue
        if area <= 0 or preco <= 0:
            continue
        out.append({'portal': 'chavesnamao', 'url': 'https://www.chavesnamao.com.br' + u,
                    'preco': preco, 'area': area, 'rs_m2': round(preco / area),
                    'dorm': it.get('bedrooms'), 'vaga': it.get('garages'),
                    'rua': _h.unescape(it.get('street') or ''), 'bairro': it.get('location'),
                    'tipo': 'Apartamento', 'lancamento': True, 'titulo': _h.unescape(it.get('title') or '')})
    return out
