#!/usr/bin/env python3
"""Configura UMA VEZ a carga semanal dos anúncios no GitHub (Rodrigo roda no terminal do Mac).

1. Cria (ou troca a senha de) o usuário de banco carga_anuncios_nsp, que só mexe em aval_anuncios_nsp,
   com uma senha nova gerada aqui (usa o acesso de produção em ~/.config/novasp/prod-pooler.dsn).
2. Abre a página de segredos do repositório no navegador.
3. Copia para a área de transferência, um de cada vez, os 3 valores: chave do Imoview (Chaveiro),
   endereço do banco com o usuário novo e token da pasta do Skybox. Nada disso aparece na tela.
"""
import os, re, secrets, subprocess, sys

REPO_SECRETS = 'https://github.com/FalcaoVaz/novasp-portal/settings/secrets/actions/new'
HOST, PORTA, PROJETO = 'aws-1-sa-east-1.pooler.supabase.com', 5432, 'mqcduyvpuxdweqesgwrq'


def copia(valor):
    subprocess.run(['pbcopy'], input=valor.encode(), check=True)


def main():
    chave = subprocess.run(['security', 'find-generic-password', '-s', 'imoview', '-a', 'nsp', '-w'],
                           capture_output=True, text=True).stdout.strip()
    if not chave:
        sys.exit('Não achei a chave do Imoview no Chaveiro (serviço imoview, conta nsp).')
    fotos = os.path.expanduser('~/Downloads/nsp-site/_ferramentas/fotos-nido-para-skybox.py')
    m = re.search(r"^TOKEN\s*=\s*'([^']+)'", open(fotos).read(), re.M) if os.path.exists(fotos) else None
    token_skybox = m.group(1) if m else ''

    if '--so-imoview' in sys.argv:   # só copia a chave do Imoview (sem mexer no banco), sem perguntas
        copia(chave)
        subprocess.run(['open', REPO_SECRETS.rsplit('/new', 1)[0]])
        print(f'✓ Chave do Imoview copiada ({len(chave)} caracteres). No GitHub, clique no lápis de IMOVIEW_KEY,')
        print('  apague o valor antigo, cole (Cmd+V) e clique em "Update secret". Não copie mais nada antes de colar.')
        return
    import psycopg2
    from psycopg2 import sql
    senha = secrets.token_hex(24)
    con = psycopg2.connect(open(os.path.expanduser('~/.config/novasp/prod-pooler.dsn')).read().strip())
    with con, con.cursor() as cur:
        cur.execute("select 1 from pg_roles where rolname = 'carga_anuncios_nsp'")
        verbo = 'alter' if cur.fetchone() else 'create'
        cur.execute(sql.SQL(verbo + ' role carga_anuncios_nsp login password {}').format(sql.Literal(senha)))
        cur.execute('grant usage on schema public to carga_anuncios_nsp')
        cur.execute('grant select, insert, delete on aval_anuncios_nsp to carga_anuncios_nsp')
        cur.execute('drop policy if exists carga_anuncios on aval_anuncios_nsp')
        cur.execute('create policy carga_anuncios on aval_anuncios_nsp for all to carga_anuncios_nsp using (true) with check (true)')
    print('✓ Usuário de banco carga_anuncios_nsp pronto (só mexe na tabela de anúncios).')
    dsn = f'postgresql://carga_anuncios_nsp.{PROJETO}:{senha}@{HOST}:{PORTA}/postgres?sslmode=require'

    if '--so-banco' in sys.argv:   # só refaz a senha e copia o endereço do banco, sem perguntas
        copia(dsn)
        subprocess.run(['open', REPO_SECRETS.rsplit('/new', 1)[0]])
        print('✓ Endereço do banco copiado. No GitHub, na lista de segredos, clique no lápis de NOVASP_DSN_ANUNCIOS,')
        print('  apague o valor antigo, cole (Cmd+V) e clique em "Update secret". Não copie mais nada antes de colar.')
        return
    subprocess.run(['open', REPO_SECRETS])
    itens = [('IMOVIEW_KEY', chave), ('NOVASP_DSN_ANUNCIOS', dsn)] + ([('SKYBOX_TOKEN', token_skybox)] if token_skybox else [])
    print('\nAbri a página "New secret" do GitHub no navegador. Para cada item abaixo:')
    print('  no campo Name escreva o nome, no campo Secret cole (Cmd+V) e clique em "Add secret".')
    print('  Depois clique em "New repository secret" para o próximo.\n')
    for i, (nome, valor) in enumerate(itens, 1):
        copia(valor)
        input(f'{i}/{len(itens)}  Name: {nome}   (valor já copiado)  → cole, salve e aperte Enter aqui ')
    copia('')
    print('\n✓ Pronto. A carga roda sozinha toda segunda às 7h.')
    print('  Para testar agora: aba Actions do repositório → "Anúncios da Nova SP" → Run workflow.')


if __name__ == '__main__':
    main()
