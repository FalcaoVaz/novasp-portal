#!/usr/bin/env python3
"""Carrega o cadastro do IPTU (GeoSampa: 12_Cadastro / IPTU_INTER / XLS_CSV / IPTU_2026.zip) no projeto Supabase "IPTU".
Recorte: CEP começando com os prefixos de --ceps (padrão 04 = Zona Sul/Vila Mariana/Ipiranga).
LGPD: só lê as colunas da lista BRANCA abaixo. Nome e CPF/CNPJ do contribuinte nunca são lidos nem gravados.
Uso:  python3 carregar_iptu.py ~/Downloads/IPTU_2026.zip  [--ceps 04,05] [--dry]"""
import argparse, csv, io, os, re, sys, unicodedata, zipfile
ap=argparse.ArgumentParser(); ap.add_argument('arquivo'); ap.add_argument('--ceps', default='04'); ap.add_argument('--dry', action='store_true')
ap.add_argument('--dsn', default=os.path.expanduser('~/.config/novasp/iptu-pooler.dsn')); a=ap.parse_args()
csv.field_size_limit(10**7)
norm=lambda s: re.sub(r'\s+',' ',unicodedata.normalize('NFD',str(s or '')).encode('ascii','ignore').decode().upper()).strip()
TIPOS=r'^(RUA|R|AVENIDA|AV|ALAMEDA|AL|TRAVESSA|TV|PRACA|PC|PCA|ESTRADA|ESTR|VIELA|VL|LARGO|LGO|PASSAGEM|PSG)\.?\s+'
lnorm=lambda s: re.sub(TIPOS,'',norm(s)).strip()
# coluna do arquivo (normalizada) -> coluna da tabela
BRANCA={'NUMERO DO CONTRIBUINTE':'sql','ANO DO EXERCICIO':'exercicio','NUMERO DO CONDOMINIO':'condominio','CODLOG DO IMOVEL':'codlog',
 'NOME DE LOGRADOURO DO IMOVEL':'logradouro','NUMERO DO IMOVEL':'numero','COMPLEMENTO DO IMOVEL':'complemento','COMPLEMENTO':'complemento',
 'BAIRRO DO IMOVEL':'bairro','CEP DO IMOVEL':'cep','FRACAO IDEAL':'fracao_ideal','AREA DO TERRENO':'area_terreno','AREA CONSTRUIDA':'area_construida',
 'AREA OCUPADA':'area_ocupada','VALOR DO M2 DO TERRENO':'vm2_terreno','VALOR DO M2 DE CONSTRUCAO':'vm2_construcao','ANO DA CONSTRUCAO CORRIGIDO':'ano_construcao',
 'QUANTIDADE DE PAVIMENTOS':'pavimentos','TESTADA PARA CALCULO':'testada','TIPO DE USO DO IMOVEL':'uso','TIPO DE PADRAO DA CONSTRUCAO':'padrao',
 'TIPO DE TERRENO':'tipo_terreno','FATOR DE OBSOLESCENCIA':'fator_obsolescencia'}
PROIBIDAS=re.compile(r'NOME DO CONTRIBUINTE|CPF|CNPJ')
NUM={'fracao_ideal','area_terreno','area_construida','area_ocupada','vm2_terreno','vm2_construcao','testada','fator_obsolescencia'}
INT={'exercicio','ano_construcao','pavimentos'}
COLS=['sql','exercicio','condominio','codlog','logradouro','logradouro_norm','numero','complemento','bairro','cep','fracao_ideal','area_terreno','area_construida',
      'area_ocupada','vm2_terreno','vm2_construcao','ano_construcao','pavimentos','testada','uso','padrao','tipo_terreno','fator_obsolescencia']
def num(v):
    v=str(v or '').strip().replace('.','').replace(',','.') if re.search(r',\d+$',str(v or '')) else str(v or '').strip()
    try: return str(float(v)) if v else ''
    except: return ''
def abrir():
    if a.arquivo.lower().endswith('.zip'):
        z=zipfile.ZipFile(a.arquivo); nome=[n for n in z.namelist() if n.lower().endswith(('.csv','.txt'))][0]; raw=z.open(nome)
    else: raw=open(a.arquivo,'rb'); nome=a.arquivo
    amostra=raw.read(4096); raw.close()
    enc='utf-8'
    try: amostra.decode('utf-8')
    except UnicodeDecodeError: enc='latin-1'
    raw=(zipfile.ZipFile(a.arquivo).open(nome) if a.arquivo.lower().endswith('.zip') else open(a.arquivo,'rb'))
    txt=io.TextIOWrapper(raw, encoding=enc, errors='replace', newline='')
    delim=';' if amostra.count(b';')>amostra.count(b',') else ','
    return nome, enc, delim, txt
nome, enc, delim, txt = abrir()
rd=csv.reader(txt, delimiter=delim); cab=[norm(c) for c in next(rd)]
idx={BRANCA[c]:i for i,c in enumerate(cab) if c in BRANCA and not PROIBIDAS.search(c)}
print(f'arquivo {nome} · {enc} · "{delim}" · {len(cab)} colunas · usadas {len(idx)}: {sorted(idx)}')
print('ignoradas (não lidas):', [c for c in cab if c not in BRANCA])
falta=[c for c in ('sql','logradouro','numero','cep','area_terreno','area_construida') if c not in idx]
if falta: sys.exit(f'colunas essenciais não encontradas: {falta}')
prefs=tuple(p.strip() for p in a.ceps.split(','))
def linhas():
    for row in rd:
        g=lambda k: row[idx[k]] if k in idx and idx[k]<len(row) else ''
        cep=re.sub(r'\D','',g('cep')).zfill(8)
        if not cep.startswith(prefs): continue
        d={k:g(k).strip() for k in idx}; d['cep']=cep; d['logradouro_norm']=lnorm(d.get('logradouro',''))
        for k in NUM: d[k]=num(d.get(k,''))
        for k in INT: d[k]=re.sub(r'\D','',d.get(k,''))[:4]
        yield [str(d.get(c,'') or '').replace('\t',' ').replace('\n',' ').replace('\\','/') for c in COLS]
if a.dry:
    n=0
    for r in linhas():
        n+=1
        if n<=3: print(dict(zip(COLS,r)))
    print('linhas no recorte:', n); sys.exit()
import psycopg2
# Carga em lotes direto na tabela (plano gratuito derruba um INSERT único de 1 mi de linhas): sem índices durante a carga, recria no fim.
c=psycopg2.connect(open(a.dsn).read().strip(), connect_timeout=30, keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=6); cur=c.cursor()
cur.execute("set statement_timeout=0")
cur.execute("drop index if exists iptu_end_idx; drop index if exists iptu_lnorm_trgm; drop index if exists iptu_cep_idx; drop index if exists iptu_cond_idx")
cur.execute("truncate iptu"); c.commit()
vistos=set(); buf=io.StringIO(); lote=0; tot=0
def flush():
    global buf, lote, tot
    if not lote: return
    buf.seek(0); cur.copy_expert("copy iptu ("+",".join(COLS)+") from stdin with (format text, null '')", buf); c.commit()
    tot+=lote; lote=0; buf=io.StringIO(); print('gravadas', tot, flush=True)
for r in linhas():
    if not r[0] or r[0] in vistos: continue
    vistos.add(r[0]); buf.write('\t'.join(r)+'\n'); lote+=1
    if lote>=50000: flush()
flush()
for ddl in ["create index iptu_end_idx on iptu (logradouro_norm, numero)",
            "create index iptu_cep_idx on iptu (cep)",
            "create index iptu_cond_idx on iptu (condominio)",
            "set maintenance_work_mem='256MB'",
            "create index iptu_lnorm_trgm on iptu using gin (logradouro_norm gin_trgm_ops)",
            "analyze iptu"]:
    cur.execute(ddl); c.commit(); print('ok:', ddl[:60], flush=True)
cur.execute("select count(*), pg_size_pretty(pg_total_relation_size('iptu')), pg_size_pretty(pg_database_size(current_database())) from iptu"); print('iptu:', cur.fetchone())
c.close()
