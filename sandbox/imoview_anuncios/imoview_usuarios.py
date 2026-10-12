#!/usr/bin/env python3
"""Sonda SÓ DE LEITURA: lista de corretores/usuários do Imoview com e-mail, para criar os logins do portal.

Testa Usuario/App_RetornarCorretores e Usuario/App_RetornarUsuarios nas 3 unidades (9305 Matriz, 9322, 9323)
e nas duas finalidades (1 locação, 2 venda). Salva as respostas em ~/Downloads/imoview-usuarios/ (ficam só
neste Mac: têm e-mail de funcionários). Na tela mostra apenas quantidades e os NOMES DOS CAMPOS — nenhum e-mail.
Não grava nada no Imoview.

Uso:  python3 imoview_usuarios.py
"""
import json, os, re, subprocess, sys, urllib.request, urllib.error

KEY = os.environ.get('IMOVIEW_KEY', '').strip() or subprocess.run(
    ['security', 'find-generic-password', '-s', 'imoview', '-a', 'nsp', '-w'], capture_output=True, text=True).stdout.strip()
if not KEY:
    sys.exit('Chave do Imoview não encontrada (IMOVIEW_KEY ou Chaveiro: serviço imoview, conta nsp).')
OUT = os.path.expanduser('~/Downloads/imoview-usuarios')
os.makedirs(OUT, exist_ok=True)
EMAIL = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')


def get(caminho):
    req = urllib.request.Request('https://api.imoview.com.br/' + caminho, headers={'chave': KEY, 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')
    except Exception as e:
        return 0, str(e)


def lista(txt):
    try:
        d = json.loads(txt)
    except ValueError:
        return None
    if isinstance(d, dict):
        d = d.get('resposta', d)
        if isinstance(d, dict):
            d = d.get('lista') or d.get('usuarios') or d.get('corretores') or d
    return d if isinstance(d, list) else None


achados = {}
for usuario in (39, 35, 11):                      # códigos de usuários conhecidos (quem "pede" a lista)
    for ep in ('App_RetornarCorretores', 'App_RetornarUsuarios'):
        for unidade in (9305, 9322, 9323):
            for fin in (2, 1):
                st, txt = get(f'Usuario/{ep}?codigoUsuario={usuario}&finalidade={fin}&codigoUnidade={unidade}')
                L = lista(txt)
                nome = f'{ep}-u{usuario}-un{unidade}-f{fin}.json'
                open(os.path.join(OUT, nome), 'w').write(txt)
                if L:
                    campos = sorted({k for x in L if isinstance(x, dict) for k in x})
                    com_email = sum(1 for x in L if EMAIL.search(json.dumps(x, ensure_ascii=False)))
                    print(f'{nome}: HTTP {st} · {len(L)} registros · {com_email} com e-mail · campos: {", ".join(campos)[:300]}')
                    for x in L:
                        if isinstance(x, dict):
                            k = x.get('codigo') or x.get('Codigo') or json.dumps(x, sort_keys=True)
                            achados[str(k)] = x
                else:
                    msg = re.sub(r'\s+', ' ', txt)[:120]
                    print(f'{nome}: HTTP {st} · sem lista ({EMAIL.sub("***", msg)})')
    if achados:
        break                                       # um código de usuário que funcione já basta

json.dump(list(achados.values()), open(os.path.join(OUT, 'usuarios-imoview.json'), 'w'), ensure_ascii=False, indent=1)
print(f'\nUsuários distintos encontrados: {len(achados)} · com e-mail: {sum(1 for x in achados.values() if EMAIL.search(json.dumps(x, ensure_ascii=False)))}')
print(f'Arquivos em {OUT} (contêm e-mails: não compartilhar).')
