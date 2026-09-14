# Nova São Paulo Imobiliária — Sistemas Integrados

## Estrutura do Projeto

```
/falcaovaz          → Sistema Jurídico FalcãoVaz
  /public/
    index.html             → Estrutura HTML (1850 linhas)
    /css/
      style.css            → Estilos extraídos (642 linhas)
    /js/                   → JS modularizado por feature
      00-config.js         → Supabase config, db helper, USERS
      01-auth.js           → SSO, login, logout
      02-init.js           → initApp
      03-planilhas.js      → Planilhas
      04-processos.js      → CRUD processos + abas
      05-email.js          → Email cliente (Resend)
      06-listas.js         → Carregar processos/prazos/chamados
      07-meus-docs.js      → Meus documentos
      08-chamados.js       → Chamados
      09-nav.js            → Navegação entre páginas
      10-dashboard.js      → Stats, tokens, feriados, calc prazo
      11-documentos.js     → Gerar/revisar/aprovar documentos
      12-uploads.js        → PDF.js, base64
      13-gerar-doc.js      → pollJob, geração IA via background
      14-modais.js         → showToast, openModal, listeners
  /netlify/functions/      → Backend serverless
    gerar-documento.js       → Geração síncrona (limite 25s)
    gerar-documento-background.js    → Geração em background (sem timeout)
    enviar-email-cliente.js  → Envio de emails via Resend
    testar-ia.js             → Diagnóstico da API Anthropic
  /sql/
    create_ia_jobs.sql       → Schema da fila de jobs assíncronos
  netlify.toml               → Configuração do Netlify

/portal             → Portal Unificado Nova São Paulo
  index.html             → Frontend completo (HTML/CSS/JS) — TODO: modularizar
```

## Stack

- **Frontend:** HTML/CSS/JS puro (sem framework)
- **Banco:** Supabase (PostgreSQL)
  - URL: https://mqcduyvpuxdweqesgwrq.supabase.co
  - Tabelas: usuarios, processos, documentos, prazos, chamados,
             andamentos_processos, financeiro, ia_jobs,
             chamados_manutencao, requisicoes_internas,
             tarefas, agenda_eventos, pauta_reunioes, horarios_livres
- **Hosting:** Netlify
  - falcaovaz → falcaovaz.netlify.app
  - portal    → novasp.netlify.app
- **IA:** Anthropic API (claude-sonnet-4-6)
- **Email:** Resend API

## Variáveis de Ambiente (Netlify)

```
ANTHROPIC_API_KEY    → Chave da API Anthropic
RESEND_API_KEY       → Chave do Resend para emails
SUPABASE_URL         → URL do projeto Supabase (opcional, tem fallback hardcoded)
SUPABASE_ANON_KEY    → Chave anon do Supabase (OBRIGATÓRIA para gerar-documento-background)
```

A `SUPABASE_ANON_KEY` é a mesma chave anon que o frontend usa (visível em `js/00-config.js`).
Sem ela, a background function não consegue gravar o resultado na tabela `ia_jobs`
e o frontend fica em polling até timeout de 3 min.

## Apps Scripts (Google Sheets)

- **Manutenção Predial:** AKfycbzEGA5rLJhxj_8e8hl-o0LS1sneRQNZx76A9rW9DVl-3s0VHu3WK4qi3HJOXkTrpMGnUw
- **Requisições Internas:** AKfycbyGxdULpRrk-UPaPWmciY6tvjzlyTvff1tsVxsaFdXH1wMiNWSpMscYTwsaHs2aUImQhw
- **Calendar:** AKfycbzvYElSoSN_rBikiur2Z-kgDF06xt8lvL-F6BfahfayyHKMWPUzqe78_s4h1YjK-0Q

## Usuários (20 perfis)

**Jurídico (nível 1 — acesso_juridico=TRUE):**
Rodrigo Falcão Vaz (admin), Fernanda Araujo, Renata Navarro,
Edna Rebesco, Durval Falcão Vaz, Janaina Alves

**Administrativo (nível 2):**
Simone Cirino, Mikaeli, Vanderleia, Vivian, João Marcus, Nogueira

**Vendas (nível 3):**
Christiane, Felippe, Emilia, Regina, Thais

**Operacional:**
Anderson (Marketing), Cibele (Telefonista), Marcelo Miranda (Manutenção), Fabio (TI)

## Problemas Conhecidos / Pendências

1. ~~**IA — Background Function:** implementada mas precisa criar tabela `ia_jobs`~~
   ✅ SQL pronto em `falcaovaz/sql/create_ia_jobs.sql` — executar no SQL Editor do Supabase.

2. **Meus Documentos:** rascunhos aparecem no badge mas visualização
   precisa de revisão no carregarPaginaDocumentos()

3. ~~**Hospedar em alternativa ao Netlify:**~~ Não é mais necessário —
   `gerar-documento-background.js` resolve o limite de 26s via background function +
   polling no Supabase. Permanecer no Netlify.

4. **Sistema Jurídico — petições:** fluxo simplificado para tela única
   implementado mas precisa de teste completo

5. **Portal — Calendar:** dados vêm do Google Apps Script com
   action=read&sheet=TAREFAS etc. (formato {success:true, data:[...]})

6. **Portal — modularizar:** `portal/index.html` ainda é monolito de 1447 linhas.
   Aplicar mesmo split feito em falcaovaz (CSS + JS por feature).

7. **Bug duplicação de funções:** `enviarParaAprovacao`, `toggleEditDoc`, `aprovarDoc`,
   `devolverDoc`, `reprovarDoc` definidas duas vezes em `13-gerar-doc.js` —
   as segundas definições sobrescrevem as primeiras (que vinham de `11-documentos.js`).
   Causa: histórico do código. Decidir qual versão manter.

## Contexto do Negócio

Nova São Paulo Imobiliária — empresa familiar fundada em 1969,
3ª geração (Rodrigo Falcão Vaz, diretor), ~150 funcionários,
múltiplas agências Zona Sul São Paulo.

Sistemas:
- **Jurídico:** gestão de processos, documentos IA, prazos, financeiro
- **Interno:** manutenção predial + requisições internas
- **Calendar:** tarefas, agenda, pauta de reuniões, horários livres
