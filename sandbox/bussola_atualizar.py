#!/usr/bin/env python3
"""Leva uma versão nova da Bússola NSP (pacote da Emilia e da Camille) para dentro do portal (09/11/2026).
Uso: python3 sandbox/bussola_atualizar.py ~/Downloads/bussola-nsp-completo-vNN.zip
- Copia, SEM alterar, o index.html, o compat.mjs e as funções alertas, auditoria e ler-imovel para portal/bussola/
  (como .js, para o Netlify servir com o tipo certo).
- No index.html só acrescenta, no <head>, o mapa de importação e o adaptador (portal/bussola/portal/adaptador.js),
  que fazem as funções de servidor delas rodarem no navegador com o login e o banco do portal.
- Não copia auth.mjs (o login é o do portal), nem verificar-alertas, rotinas do GitHub ou a pasta data
  (os dados continuam vindo do GitHub delas).
"""
import os, re, sys, time, zipfile

ZIP = os.path.expanduser(sys.argv[1])
DEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'portal', 'bussola')
V = time.strftime('%Y%m%d%H%M')
z = zipfile.ZipFile(ZIP)
nomes = {os.path.basename(n): n for n in z.namelist() if not n.endswith('/') and '__MACOSX' not in n}
def ler(nome):
    if nome not in nomes: sys.exit(f'Arquivo {nome} não está no pacote.')
    return z.read(nomes[nome]).decode('utf-8')

html = ler('index.html')
mapa = ('<script type="importmap">{"imports":{'
        f'"@netlify/blobs":"./portal/blobs.js?v={V}",'
        f'"./netlify/functions/auth.mjs":"./portal/auth.js?v={V}",'
        f'"./compat.mjs":"./compat.js?v={V}"'
        '}}</script>\n'
        f'<script src="./portal/adaptador.js?v={V}"></script>\n')
if 'portal/adaptador.js' in html: sys.exit('index.html já tem o adaptador: use o index.html original do pacote.')
m = re.search(r'<head[^>]*>', html, re.I)
if not m: sys.exit('index.html sem <head>.')
html = html[:m.end()] + '\n<!-- Portal NovaSP: mapa de importação + adaptador (sandbox/bussola_atualizar.py) -->\n' + mapa + html[m.end():]
os.makedirs(os.path.join(DEST, 'netlify', 'functions'), exist_ok=True)
open(os.path.join(DEST, 'index.html'), 'w', encoding='utf-8').write(html)
open(os.path.join(DEST, 'compat.js'), 'w', encoding='utf-8').write(ler('compat.mjs'))
for f in ('alertas', 'auditoria', 'ler-imovel'):
    open(os.path.join(DEST, 'netlify', 'functions', f + '.js'), 'w', encoding='utf-8').write(ler(f + '.mjs'))
# versão também nas rotas do adaptador (evita cache antigo)
ad = os.path.join(DEST, 'portal', 'adaptador.js'); s = open(ad, encoding='utf-8').read()
s = re.sub(r"(\./(?:portal/auth|netlify/functions/(?:alertas|auditoria|ler-imovel))\.js)(\?v=\d+)?'", lambda m: f"{m.group(1)}?v={V}'", s)
open(ad, 'w', encoding='utf-8').write(s)
print(f'ok: portal/bussola atualizado a partir de {os.path.basename(ZIP)} (versão {V})')
