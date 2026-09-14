# Guia do Banco de Dados — Sistemas Nova São Paulo

Escrito pro T.I. (Fabio) se familiarizar com a estrutura. Atualizado em 05/08/2026.

---

## 1. O que é

O banco dos dois sistemas (Portal e Jurídico) é um **PostgreSQL gerenciado pelo Supabase**
(supabase.com — o domínio da API é `supabase.co` mesmo, **não** é erro de digitação).

- Projeto: `mqcduyvpuxdweqesgwrq` (organização "Nova SP", plano Free)
- API REST: `https://mqcduyvpuxdweqesgwrq.supabase.co/rest/v1/...` (PostgREST)
- Autenticação: `https://mqcduyvpuxdweqesgwrq.supabase.co/auth/v1/...` (GoTrue)
- Painel: https://supabase.com/dashboard → projeto `falcaovaz-juridico`

**Não existe "código fonte" do banco num servidor nosso** — o schema (DDL) está versionado
em arquivos `.sql` dentro dos projetos (seção 4) e o banco vivo se explora pelo painel.

## 2. Como os sistemas acessam

- O front (HTML/JS puro, sem backend próprio) fala **direto com a API REST**, usando a
  **chave anônima** (`anon key`) que está em `portal/js/00-config.js` e
  `falcaovaz/public/js/00-config.js`. Essa chave é pública por design.
- Desde jul/2026 (Fase 1 da segurança), o login do portal também abre uma **sessão
  autenticada** no Supabase Auth e as requisições passam a ir com o token do usuário
  (função `hdr()` no `00-config.js` do portal).
- **Fase 2 (pendente)**: ativar RLS (Row Level Security) — aí a chave anônima deixa de
  ler/escrever e só usuário logado acessa. Roteiro completo em
  `portal/sql/2026-07-30-rls-fase2.sql` (inclui checklist e rollback).
- Acessos server-side (usam chave própria, nunca no front):
  - Netlify Functions do jurídico (`falcaovaz/netlify/functions/`) — env `SUPABASE_KEY`
  - Google Apps Script: `sync-tjsp-datajud.gs` (andamentos TJSP) e `sweeper-bounces.gs`
    (bounces de email) — chave no próprio script

## 3. Mapa das tabelas (por módulo)

**Pessoas e acesso**
- `usuarios` — cadastro central (nome, email, dept, nivel, flags de acesso,
  `senha_hash` SHA-256). A view `usuarios_login` expõe só o mínimo pra tela de login.
- `auth.users` (schema do Supabase) — contas da Fase 1, criadas no 1º login.

**Gestão & Feedback (portal)**
- `gestao_liderados` — vínculos líder → colaborador (`lider_id`, `colaborador_id`,
  `ativo`, datas). O organograma é montado só disso.
- `gestao_avaliacoes`, `gestao_avaliacoes_lider` — avaliações trimestrais
  (período no formato `2026-Q3`), avaliação do líder pelo time.
- `gestao_perguntas`, `gestao_perguntas_lider` — formulários das avaliações.
- `gestao_tarefas_bonus`, `gestao_bonus_config`, `gestao_bonus_apuracoes` — metas e bônus.

**Vendas (portal)**
- `vendas_corretores`, `vendas_selecao_imoveis`, `vendas_selecao_votos` — seleção
  mensal de imóveis (ciclo vira dia 10; peneira com 5 votantes, 3 decidem).
- `vendas_presencas`, `vendas_atividades`, `vendas_cotas` — presença e cotas.
- `vendas_agenda_fotografo`, `vendas_fotografo_disponibilidade` — agenda do fotógrafo.
- `vendas_forum_ciclos/_topicos/_comentarios/_votos/_apoios` — Fórum dos Representantes
  (ciclos trimestrais).

**Jurídico (falcaovaz)**
- `processos` — processos judiciais (número CNJ, status ativo/encerrado, cliente).
- `andamentos_processos` — movimentações (alimentado pelo GAS de sync TJSP).
- `prazos` — prazos processuais.
- `documentos` — documentos gerados pela IA (protocolo, conteúdo, status
  rascunho → em_revisao → aprovado/devolvido, `autor_id`, `revisor_id`).
- `ia_jobs` — fila da geração por IA (status gerando/pronto/erro, resultado).
- `acordos_extrajudiciais`, `calculos_atualizacao`, `financeiro` — acordos e cálculos.
- `chamados` — chamados internos ao jurídico.

**Infra/comunicação**
- `notificacoes_email`, `notificacoes_falha` — log de emails e falhas (bounces).
- `atividades_semanais`, `atividades_semanais_check` — checklist semanal (portal).

**Atenção:** Agenda, Tarefas e Pautas do módulo Calendar **não estão no Supabase** —
ficam em planilhas Google acessadas por Apps Script (URLs no `00-config.js` do portal).

## 4. Onde está o DDL (histórico de schema)

Convenção do projeto: **cada mudança de schema vira um arquivo .sql** — rodado
manualmente no SQL Editor, bloco a bloco (o editor só mostra o resultado do último
comando).

- `portal/sql/` — módulos do portal (gestão, vendas, fórum, atividades…) e os
  roteiros recentes: `2026-07-30-rls-fase2.sql`, `2026-07-30-monitor-migracao.sql`,
  `2026-08-05-joao-gerente-adm.sql`.
- `falcaovaz/sql/` — jurídico (`create_ia_jobs.sql`, `acordos_extrajudiciais.sql`,
  colunas do sync TJSP/DJEN…).

Pra ver o schema vivo: painel → **Database → Tables** (estrutura + dados) ou rode no
SQL Editor:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

## 5. Regras de convivência (importante)

1. **É produção.** Não existe ambiente de teste — todo write vale de verdade.
   Explorar = SELECT à vontade; UPDATE/DELETE só com combinação prévia.
2. Backup: painel → Database → Backups (diário no plano Free, retenção curta).
3. Nunca colocar a **service_role key** em front/planilha/GAS compartilhado — ela
   ignora toda segurança. Hoje ela só deve existir nas envs do Netlify e nos 2 GAS
   (e isso só a partir da Fase 2).
4. As senhas dos usuários são hash SHA-256 sem salt — trate `senha_hash` como dado
   sensível (a Fase 2 tira ele do alcance público).
5. Emails automáticos, planilhas e calendário são **Apps Script**, não banco — ao
   editar um GAS: Implantar → Gerenciar implantações → **editar a existente → Nova
   versão** (implantação nova muda a URL e quebra a integração).

## 6. Acesso pro Fabio ao painel

O Rodrigo pode convidar em: painel → organização Nova SP → **Team → Invite member**.
Papel sugerido: **Developer** (explora tudo, sem poder apagar o projeto/mudar billing).
