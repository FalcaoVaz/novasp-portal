# Sandbox do piloto — passo a passo

Objetivo: um projeto Supabase **separado da produção**, carregado do backup diário
com **nome de proprietário/cliente mascarado**, e um **deploy preview do Netlify**
apontando para ele. O Fabio e os participantes testam aqui; produção fica intocada.

## 1. Criar o projeto sandbox (você, no painel Supabase)
- Novo projeto (ex.: `novasp-sandbox`), região `sa-east-1`, plano Free serve.
- Guarde a senha do banco. Pegue o **DSN direto**: Settings → Database → Connection string → *Direct connection*.

## 2. Aplicar o schema
No SQL Editor do sandbox, cole e rode `01-schema.sql` (45 tabelas + RLS "acesso autenticado", igual à produção). Ou por linha de comando:
```
psql "postgresql://postgres:SENHA@db.XXXX.supabase.co:5432/postgres" -f 01-schema.sql
```

## 3. Carregar os dados mascarados
```
export SANDBOX_DSN="postgresql://postgres:SENHA@db.XXXX.supabase.co:5432/postgres"
python3 carregar_sandbox.py --dry-run     # confere o mascaramento
python3 carregar_sandbox.py               # carrega (recusa DSN de produção)
```
- Mascara **terceiros**: `acordos_extrajudiciais.proprietario`, `processos.autor/reu/nome_cliente/email_cliente`, telefones de chamados e agenda do fotógrafo. Para mascarar também endereços ou staff, edite o dicionário `MASK` no topo do script.
- Mantém **staff** (nomes de funcionários/corretores) — o app precisa deles pra ser testável.

## 4. Auth do sandbox
- Em Authentication → Providers → Email: **desligue "Confirm email"** (como na produção).
- As contas são recriadas quando cada pessoa faz login (o portal cria no GoTrue). Para o Fabio entrar, ele usa e-mail+senha de um usuário que exista na tabela `usuarios` (já veio no backup) — no 1º login o portal cria a conta no Auth.

## 5. Deploy preview do Netlify apontando pro sandbox
O portal tem as credenciais Supabase **hardcoded** em `portal/js/00-config.js` (`SBU`/`SBK`). Então o preview usa um **branch** com as credenciais do sandbox:
```
git checkout -b sandbox
# edite portal/js/00-config.js: troque SBU e SBK pela URL e anon key do SANDBOX
# (mesma coisa no jurídico, se for testar o falcaovaz)
git commit -am "sandbox: aponta Supabase para o projeto de teste"
git push -u origin sandbox
```
No Netlify (time NOVASP): conecte o repositório do GitHub ao site (ou crie um site novo a partir dele) e habilite **Branch deploys** para `sandbox` → sai uma URL de preview (`sandbox--<site>.netlify.app`). Essa URL fala só com o sandbox; a produção (`main`) nunca muda.

> Nunca dê merge do branch `sandbox` na `main` — ele contém credenciais de teste, não de produção.

## Regras do piloto (lembrete)
- Só o Rodrigo faz código e deploy. O Fabio testa no sandbox, faz exports e Git.
- Ninguém trabalha com dado que tenha nome de proprietário fora do sandbox.
