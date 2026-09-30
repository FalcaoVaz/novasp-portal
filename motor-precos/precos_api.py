#!/usr/bin/env python3
"""
Motor de preço AO VIVO — o único pedaço que precisa ficar no ar.

Por que existe: o navegador não consegue raspar anúncio (CORS). Então este
serviço mínimo faz só isso: recebe um bairro, busca anúncios ao vivo e devolve
a mediana de R$/m² (apto e casa) + uma amostra. NADA de banco, NADA de segredo:
geocode, zoneamento, comparáveis de fechamento e gravação acontecem no
navegador, com o login do corretor (RPCs do Supabase). Se este host cair ou
for comprometido, não há senha de banco aqui.

Rodar local:  cd motor-precos && EXIGE_LOGIN=0 python3 -m uvicorn precos_api:app --port 8902
Deploy:       Render (free) a partir deste repo, root dir motor-precos — ver README.md.
"""
import os, sys, statistics, unicodedata, re, json, urllib.request, time
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from coletor_anuncios import busca_quintoandar

SB = os.environ.get('SB_URL', 'https://mqcduyvpuxdweqesgwrq.supabase.co')
# anon key é PÚBLICA (já vai no navegador) — só serve p/ validar que quem
# chama está logado, evitando abrir nosso raspador pra qualquer um.
ANON = os.environ.get('SB_ANON', '')
EXIGE_LOGIN = os.environ.get('EXIGE_LOGIN', '1') == '1'

app = FastAPI(title='Motor de Preço ao Vivo — NovaSP')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])

_cache = {}                       # bairro → (ts, payload); TTL curto p/ não re-raspar
TTL = 60 * 30                     # 30 min


def _slug(b):
    b = unicodedata.normalize('NFD', (b or '').lower()).encode('ascii', 'ignore').decode()
    b = re.sub(r'\(.*?\)', '', b)
    b = re.sub(r'[^a-z0-9]+', '-', b).strip('-')
    return f'{b}-sao-paulo-sp-brasil'


def _valida(authorization):
    if not EXIGE_LOGIN:
        return True
    if not authorization or not authorization.lower().startswith('bearer '):
        raise HTTPException(401, 'sem token')
    tok = authorization.split(' ', 1)[1]
    try:
        req = urllib.request.Request(f'{SB}/auth/v1/user',
              headers={'apikey': ANON or tok, 'Authorization': 'Bearer ' + tok})
        with urllib.request.urlopen(req, timeout=10):
            return True
    except Exception:
        raise HTTPException(401, 'token inválido')


@app.get('/health')
def health():
    return {'ok': True}


@app.get('/precos')
def precos(bairro: str, authorization: str = Header(None)):
    _valida(authorization)
    if not bairro or len(bairro) < 2:
        raise HTTPException(400, 'bairro obrigatório')
    hit = _cache.get(bairro.upper())
    if hit and time.time() - hit[0] < TTL:
        return {**hit[1], 'cache': True}

    rs_apto = rs_casa = None
    n_apto = n_casa = 0
    amostra = []
    try:
        an = busca_quintoandar(_slug(bairro))
        pa = [a for a in an if a.get('rs_m2') and a.get('tipo') != 'Casa']
        pc = [a for a in an if a.get('rs_m2') and a.get('tipo') == 'Casa']
        n_apto, n_casa = len(pa), len(pc)
        if pa:
            rs_apto = round(statistics.median([a['rs_m2'] for a in pa]))
        if pc:
            rs_casa = round(statistics.median([a['rs_m2'] for a in pc]))
        for a in (pc + pa)[:8]:
            amostra.append({'tipo': a.get('tipo'), 'area': a.get('area'),
                            'preco': a.get('preco'), 'rs_m2': round(a['rs_m2']),
                            'dorm': a.get('dorm')})
    except Exception as e:
        raise HTTPException(502, f'falha ao buscar anúncios: {e}')

    payload = {'bairro': bairro, 'rs_apto': rs_apto, 'rs_casa': rs_casa,
               'n_apto': n_apto, 'n_casa': n_casa, 'amostra': amostra,
               'fonte': 'quintoandar', 'cache': False}
    _cache[bairro.upper()] = (time.time(), payload)
    return payload
