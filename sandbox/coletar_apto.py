#!/usr/bin/env python3
"""Coleta os lançamentos de São Paulo publicados na apto.vc (robots.txt permite; ~1 req/s) e grava em aval_lanc_anuncio
(uma linha por planta: área privativa + preço). Rodar de novo para atualizar (sugestão: mensal). Retoma de onde parou (cache local)."""
import re, json, time, os, sys, urllib.request, io, psycopg2
UA={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128 Safari/537.36 (NovaSP avaliacao; contato rodrigo@novasaopaulo.com.br)'}
CACHE=os.path.expanduser('~/Downloads/novasp-extraido/sandbox/cache_apto'); os.makedirs(CACHE, exist_ok=True)
PAUSA=float(os.environ.get('PAUSA','0.9'))
def page(u):
    for t in range(3):
        try:
            h=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=40).read().decode('utf-8','ignore'); time.sleep(PAUSA)
            m=re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>',h,re.S)
            return json.loads(m.group(1))['props']['pageProps'] if m else None
        except Exception as e:
            time.sleep(3*(t+1))
    return None
T0=time.time(); MAX_MIN=float(os.environ.get('MAX_MIN','0'))   # orçamento de tempo por etapa (0 = sem limite); o que faltar fica para a próxima
LISTA=os.path.join(CACHE,'_lista.json')
# 1) lista (reaproveita a do mesmo dia)
lista=[]; p=1
if os.path.exists(LISTA) and time.time()-os.path.getmtime(LISTA)<86400: lista=json.load(open(LISTA)); print('lista do cache:', len(lista), flush=True)
while not os.path.exists(LISTA) or time.time()-os.path.getmtime(LISTA)>=86400:
    pp=page('https://apto.vc/br/sp/sao-paulo'+(f'?page={p}' if p>1 else ''))
    if not pp or 'realties' not in pp: break
    for r in pp['realties']['data']: lista.append({'id':r['id'],'permalink':r['permalink'],'status':(r.get('status') or {}).get('name'),'bairro':((r.get('neighborhoods') or [{}])[0] or {}).get('name')})
    if p%20==0: print('lista: página', p, len(lista), flush=True)
    if not pp['pagination'].get('hasNextPage'): json.dump(lista,open(LISTA,'w')); break
    p+=1
print('lançamentos listados:', len(lista), flush=True)
# Zona Sul primeiro (o resto da cidade vem nas etapas seguintes)
import unicodedata
_n=lambda x: unicodedata.normalize('NFD',str(x or '')).encode('ascii','ignore').decode().lower()
ZS=('saude','vila mariana','moema','campo belo','jabaquara','ipiranga','clementino','klabin','brooklin','santo amaro','cursino','sacoma','vila guarani',
    'planalto paulista','mirandopolis','indianopolis','aclimacao','paraiso','vila monumento','vila gumercindo','bosque da saude','jardim da saude','vila mascote',
    'vila olimpia','itaim','chacara santo antonio','campo grande','americanopolis','cidade ademar','vila santa catarina','jardim aeroporto','conceicao','vila clementino')
lista.sort(key=lambda it: 0 if any(z in _n(it.get('bairro')) for z in ZS) else 1)
# 2) detalhes (cache por id)
linhas=[]; feitos=0
for i,it in enumerate(lista):
    f=os.path.join(CACHE,f"{it['id']}.json")
    if os.path.exists(f) and time.time()-os.path.getmtime(f)<20*86400: d=json.load(open(f))
    elif MAX_MIN and time.time()-T0>MAX_MIN*60: d=None   # fora do orçamento: só usa o cache nesta etapa
    else:
        pp=page(it['permalink']); d=pp.get('data') if pp and isinstance(pp.get('data'),dict) else None
        if d: json.dump(d,open(f,'w'))
        feitos+=1
    if not d: continue
    try: lat=float(d.get('latitude')); lng=float(d.get('longitude'))
    except: continue
    for fp in d.get('floorplans') or []:
        a=fp.get('area'); pr=fp.get('discountedPrice') or fp.get('price')
        try: a=float(a); pr=float(pr)
        except: continue
        if not (15<=a<=600 and 80000<=pr<=40e6): continue
        linhas.append((it['id'], d.get('name'), it['bairro'], it['status'], lat, lng, d.get('lotArea') or None, d.get('floors') or None, a, pr, it['permalink']))
    if (i+1)%100==0: print('detalhes:', i+1, '/', len(lista), '· baixados', feitos, '· plantas', len(linhas), flush=True)
faltam=sum(1 for it in lista if not os.path.exists(os.path.join(CACHE,f"{it['id']}.json")))
print('plantas válidas:', len(linhas), '· lançamentos ainda sem detalhe:', faltam, flush=True)
# 3) grava
c=psycopg2.connect(open(os.path.expanduser('~/.config/novasp/prod-pooler.dsn')).read().strip(), connect_timeout=30); cur=c.cursor()
cur.execute("""create table if not exists aval_lanc_anuncio (
  id bigserial primary key, realty_id integer, nome text, bairro text, status text, lat double precision, lng double precision,
  lote_m2 numeric, andares integer, area numeric, preco numeric, rs_m2 numeric, permalink text, fonte text default 'apto.vc', coletado_em date default current_date,
  geom geometry(Point,4326))""")
cur.execute("create index if not exists idx_aval_lanc_anuncio_geom on aval_lanc_anuncio using gist (geom)")
cur.execute("alter table aval_lanc_anuncio enable row level security; revoke all on aval_lanc_anuncio from anon, authenticated")
cur.execute("delete from aval_lanc_anuncio where fonte='apto.vc'")
def num(v):
    try: return int(float(re.sub(r'[^\d.]','',str(v)))) if v not in (None,'') else None
    except: return None
buf=io.StringIO()
for (rid,nome,bairro,stt,lat,lng,lote,andares,a,pr,link) in linhas:
    vals=[rid,(nome or '').replace('\t',' '),(bairro or '').replace('\t',' '),stt or '',lat,lng,num(lote) or '',num(andares) or '',a,pr,round(pr/a,2),link]
    buf.write('\t'.join('' if v is None else str(v) for v in vals)+'\n')
buf.seek(0)
cur.copy_expert("copy aval_lanc_anuncio (realty_id,nome,bairro,status,lat,lng,lote_m2,andares,area,preco,rs_m2,permalink) from stdin with (format text, null '')", buf)
cur.execute("update aval_lanc_anuncio set geom=st_setsrid(st_makepoint(lng,lat),4326) where geom is null")
c.commit()
cur.execute("select count(*), count(distinct realty_id), pg_size_pretty(pg_total_relation_size('aval_lanc_anuncio')) from aval_lanc_anuncio"); print('gravado:', cur.fetchone())
