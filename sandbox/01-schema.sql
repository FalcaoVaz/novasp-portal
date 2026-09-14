-- Schema do SANDBOX (introspecção da produção, 45 tabelas). Rodar no SQL Editor do projeto sandbox.
-- Gerado 14/09/2026. Recria estrutura; dados vêm da carga mascarada (carregar_sandbox.py).

create extension if not exists pgcrypto;

create table if not exists acordos_extrajudiciais (
  "id" uuid default gen_random_uuid() not null,
  "proprietario" text not null,
  "inquilino" text not null,
  "contrato" text,
  "dia_pagamento" integer,
  "valor_parcela" numeric(12,2),
  "parcelas_pagas" integer default 0,
  "parcelas_total" integer,
  "situacao" text,
  "status" text default 'ativo'::text,
  "processo_id" uuid,
  "responsavel_id" uuid,
  "observacoes" text,
  "criado_em" timestamp with time zone default now(),
  "atualizado_em" timestamp with time zone default now()
);
alter table acordos_extrajudiciais add constraint "acordos_extrajudiciais_pkey" PRIMARY KEY (id);
alter table acordos_extrajudiciais add constraint "acordos_extrajudiciais_processo_id_fkey" FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE SET NULL;
alter table acordos_extrajudiciais add constraint "acordos_extrajudiciais_responsavel_id_fkey" FOREIGN KEY (responsavel_id) REFERENCES usuarios(id);
alter table acordos_extrajudiciais add constraint "acordos_extrajudiciais_parcelas_pagas_check" CHECK ((parcelas_pagas >= 0));
alter table acordos_extrajudiciais add constraint "acordos_extrajudiciais_parcelas_total_check" CHECK ((parcelas_total > 0));
alter table acordos_extrajudiciais add constraint "acordos_extrajudiciais_dia_pagamento_check" CHECK (((dia_pagamento >= 1) AND (dia_pagamento <= 31)));
alter table acordos_extrajudiciais add constraint "acordos_extrajudiciais_status_check" CHECK ((status = ANY (ARRAY['ativo'::text, 'concluido'::text, 'rompido'::text, 'renegociado'::text])));
create index if not exists idx_acordos_status ON public.acordos_extrajudiciais USING btree (status);
create index if not exists idx_acordos_processo ON public.acordos_extrajudiciais USING btree (processo_id);
create index if not exists idx_acordos_responsavel ON public.acordos_extrajudiciais USING btree (responsavel_id);
create index if not exists idx_acordos_dia_pgto ON public.acordos_extrajudiciais USING btree (dia_pagamento);

create table if not exists agenda_eventos (
  "id" bigint not null,
  "titulo" text not null,
  "data" date,
  "hora_inicio" text,
  "hora_fim" text,
  "tipo" text,
  "responsavel" text,
  "descricao" text,
  "criado_em" timestamp with time zone default now(),
  "repete_grupo" bigint
);
alter table agenda_eventos add constraint "agenda_eventos_pkey" PRIMARY KEY (id);
create index if not exists idx_agenda_data ON public.agenda_eventos USING btree (data);
create index if not exists idx_agenda_grupo ON public.agenda_eventos USING btree (repete_grupo);

create table if not exists andamentos_manutencao (
  "id" uuid default gen_random_uuid() not null,
  "chamado_id" uuid,
  "descricao" text not null,
  "usuario_id" uuid,
  "criado_em" timestamp with time zone default now()
);
alter table andamentos_manutencao add constraint "andamentos_manutencao_pkey" PRIMARY KEY (id);
alter table andamentos_manutencao add constraint "andamentos_manutencao_chamado_id_fkey" FOREIGN KEY (chamado_id) REFERENCES chamados_manutencao(id) ON DELETE CASCADE;
alter table andamentos_manutencao add constraint "andamentos_manutencao_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES usuarios(id);

create table if not exists andamentos_processos (
  "id" uuid default gen_random_uuid() not null,
  "processo_id" uuid,
  "tipo" text default 'Andamento'::text,
  "descricao" text not null,
  "data" date default CURRENT_DATE,
  "criado_por_id" uuid,
  "criado_em" timestamp with time zone default now(),
  "origem" text default 'manual'::text,
  "texto_completo" text,
  "id_comunicacao" bigint,
  "tipo_documento" text,
  "link_origem" text
);
alter table andamentos_processos add constraint "andamentos_processos_pkey" PRIMARY KEY (id);
alter table andamentos_processos add constraint "andamentos_processos_criado_por_id_fkey" FOREIGN KEY (criado_por_id) REFERENCES usuarios(id);
alter table andamentos_processos add constraint "andamentos_processos_processo_id_fkey" FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE CASCADE;
create index if not exists idx_andamentos_processo ON public.andamentos_processos USING btree (processo_id);
create unique index if not exists ux_andamento_djen_dedup ON public.andamentos_processos USING btree (processo_id, id_comunicacao) WHERE (id_comunicacao IS NOT NULL);
create index if not exists idx_andamento_tipo_doc ON public.andamentos_processos USING btree (tipo_documento) WHERE (tipo_documento IS NOT NULL);

create table if not exists atividades_semanais (
  "id" uuid default gen_random_uuid() not null,
  "usuario_id" uuid not null,
  "descricao" text not null,
  "ordem" integer default 0,
  "ativo" boolean default true,
  "criado_em" timestamp with time zone default now(),
  "criado_por_id" uuid
);
alter table atividades_semanais add constraint "atividades_semanais_pkey" PRIMARY KEY (id);
alter table atividades_semanais add constraint "atividades_semanais_criado_por_id_fkey" FOREIGN KEY (criado_por_id) REFERENCES usuarios(id);
alter table atividades_semanais add constraint "atividades_semanais_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
create index if not exists idx_atvsem_usuario ON public.atividades_semanais USING btree (usuario_id);
create index if not exists idx_atvsem_ativo ON public.atividades_semanais USING btree (ativo) WHERE (ativo = true);

create table if not exists atividades_semanais_check (
  "id" uuid default gen_random_uuid() not null,
  "atividade_id" uuid not null,
  "usuario_id" uuid not null,
  "semana_iso" text not null,
  "feito" boolean default true,
  "feito_em" timestamp with time zone default now(),
  "observacao" text
);
alter table atividades_semanais_check add constraint "atividades_semanais_check_atividade_id_semana_iso_key" UNIQUE (atividade_id, semana_iso);
alter table atividades_semanais_check add constraint "atividades_semanais_check_pkey" PRIMARY KEY (id);
alter table atividades_semanais_check add constraint "atividades_semanais_check_atividade_id_fkey" FOREIGN KEY (atividade_id) REFERENCES atividades_semanais(id) ON DELETE CASCADE;
alter table atividades_semanais_check add constraint "atividades_semanais_check_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
create index if not exists idx_atvsem_chk_usu ON public.atividades_semanais_check USING btree (usuario_id);
create index if not exists idx_atvsem_chk_sem ON public.atividades_semanais_check USING btree (semana_iso);

create table if not exists calculos_atualizacao (
  "id" uuid default gen_random_uuid() not null,
  "processo_id" uuid,
  "titulo" text,
  "parcelas" jsonb default '[]'::jsonb not null,
  "data_final" date not null,
  "indice" text not null,
  "indice_manual_pct" numeric(10,4),
  "juros_pct_am" numeric(10,4) default 1,
  "juros_tipo" text default 'simples'::text,
  "multa_pct" numeric(10,4) default 0,
  "honorarios_pct" numeric(10,4) default 0,
  "resultado" jsonb,
  "observacoes" text,
  "criado_em" timestamp with time zone default now(),
  "criado_por_id" uuid
);
alter table calculos_atualizacao add constraint "calculos_atualizacao_pkey" PRIMARY KEY (id);
alter table calculos_atualizacao add constraint "calculos_atualizacao_criado_por_id_fkey" FOREIGN KEY (criado_por_id) REFERENCES usuarios(id);
alter table calculos_atualizacao add constraint "calculos_atualizacao_processo_id_fkey" FOREIGN KEY (processo_id) REFERENCES processos(id) ON DELETE SET NULL;
alter table calculos_atualizacao add constraint "calculos_atualizacao_juros_tipo_check" CHECK ((juros_tipo = ANY (ARRAY['simples'::text, 'composto'::text])));
create index if not exists idx_calc_processo ON public.calculos_atualizacao USING btree (processo_id);
create index if not exists idx_calc_criado ON public.calculos_atualizacao USING btree (criado_em DESC);

create table if not exists chamados (
  "id" uuid default gen_random_uuid() not null,
  "protocolo" text not null,
  "titulo" text not null,
  "descricao" text,
  "urgencia" text default 'media'::text,
  "solicitante_id" uuid,
  "responsavel_id" uuid,
  "status" text default 'aberto'::text,
  "resposta" text,
  "documento_id" uuid,
  "criado_em" timestamp with time zone default now(),
  "atualizado_em" timestamp with time zone default now()
);
alter table chamados add constraint "chamados_protocolo_key" UNIQUE (protocolo);
alter table chamados add constraint "chamados_pkey" PRIMARY KEY (id);
alter table chamados add constraint "chamados_documento_id_fkey" FOREIGN KEY (documento_id) REFERENCES documentos(id);
alter table chamados add constraint "chamados_responsavel_id_fkey" FOREIGN KEY (responsavel_id) REFERENCES usuarios(id);
alter table chamados add constraint "chamados_solicitante_id_fkey" FOREIGN KEY (solicitante_id) REFERENCES usuarios(id);
create index if not exists idx_chamados_status ON public.chamados USING btree (status);
create index if not exists idx_chamados_responsavel ON public.chamados USING btree (responsavel_id);

create table if not exists chamados_manutencao (
  "id" uuid default gen_random_uuid() not null,
  "protocolo" text not null,
  "imovel" text not null,
  "locatario" text,
  "telefone" text,
  "tipo_servico" text,
  "descricao" text not null,
  "responsabilidade" text default 'Imobiliária indica profissional'::text,
  "profissional" text,
  "status" text default 'Aberto'::text,
  "observacoes" text,
  "valor_servico" numeric(10,2),
  "retorno_imovel" numeric(10,2),
  "aberto_por_id" uuid,
  "criado_em" timestamp with time zone default now(),
  "atualizado_em" timestamp with time zone default now()
);
alter table chamados_manutencao add constraint "chamados_manutencao_protocolo_key" UNIQUE (protocolo);
alter table chamados_manutencao add constraint "chamados_manutencao_pkey" PRIMARY KEY (id);
alter table chamados_manutencao add constraint "chamados_manutencao_aberto_por_id_fkey" FOREIGN KEY (aberto_por_id) REFERENCES usuarios(id);
create index if not exists "idx_manutenção_status" ON public.chamados_manutencao USING btree (status);
create index if not exists "idx_manutenção_criado" ON public.chamados_manutencao USING btree (criado_em);

create table if not exists check_semanal (
  "id" uuid default gen_random_uuid() not null,
  "titulo" text not null,
  "responsavel_id" uuid,
  "semana" date not null,
  "concluido" boolean default false,
  "criado_em" timestamp with time zone default now()
);
alter table check_semanal add constraint "check_semanal_pkey" PRIMARY KEY (id);
alter table check_semanal add constraint "check_semanal_responsavel_id_fkey" FOREIGN KEY (responsavel_id) REFERENCES usuarios(id);
create index if not exists idx_check_semana ON public.check_semanal USING btree (semana);

create table if not exists documentos (
  "id" uuid default gen_random_uuid() not null,
  "protocolo" text not null,
  "tipo" text not null,
  "modulo" text not null,
  "referencia" text,
  "conteudo" text,
  "processo_id" uuid,
  "autor_id" uuid,
  "revisor_id" uuid,
  "aprovador_id" uuid,
  "status" text default 'rascunho'::text,
  "tokens_usados" integer default 0,
  "comentario_revisor" text,
  "comentario_aprovador" text,
  "criado_em" timestamp with time zone default now(),
  "atualizado_em" timestamp with time zone default now()
);
alter table documentos add constraint "documentos_protocolo_key" UNIQUE (protocolo);
alter table documentos add constraint "documentos_pkey" PRIMARY KEY (id);
alter table documentos add constraint "documentos_aprovador_id_fkey" FOREIGN KEY (aprovador_id) REFERENCES usuarios(id);
alter table documentos add constraint "documentos_autor_id_fkey" FOREIGN KEY (autor_id) REFERENCES usuarios(id);
alter table documentos add constraint "documentos_processo_id_fkey" FOREIGN KEY (processo_id) REFERENCES processos(id);
alter table documentos add constraint "documentos_revisor_id_fkey" FOREIGN KEY (revisor_id) REFERENCES usuarios(id);
create index if not exists idx_documentos_autor ON public.documentos USING btree (autor_id);
create index if not exists idx_documentos_revisor ON public.documentos USING btree (revisor_id);
create index if not exists idx_documentos_aprovador ON public.documentos USING btree (aprovador_id);
create index if not exists idx_documentos_status ON public.documentos USING btree (status);

create table if not exists financeiro (
  "id" uuid default gen_random_uuid() not null,
  "processo_id" uuid,
  "tipo" text not null,
  "descricao" text,
  "valor" numeric(15,2) not null,
  "recebido" numeric(15,2) default 0,
  "vencimento" date,
  "status" text default 'aberto'::text,
  "criado_em" timestamp with time zone default now()
);
alter table financeiro add constraint "financeiro_pkey" PRIMARY KEY (id);
alter table financeiro add constraint "financeiro_processo_id_fkey" FOREIGN KEY (processo_id) REFERENCES processos(id);

create sequence if not exists gestao_avaliacoes_id_seq;
create table if not exists gestao_avaliacoes (
  "id" bigint default nextval('gestao_avaliacoes_id_seq'::regclass) not null,
  "colaborador_id" uuid not null,
  "lider_id" uuid not null,
  "periodo" text not null,
  "respostas" jsonb default '{}'::jsonb,
  "observacoes" text,
  "status" text default 'rascunho'::text,
  "criado_em" timestamp with time zone default now(),
  "finalizada_em" timestamp with time zone
);
alter table gestao_avaliacoes add constraint "gestao_avaliacoes_colaborador_id_periodo_key" UNIQUE (colaborador_id, periodo);
alter table gestao_avaliacoes add constraint "gestao_avaliacoes_pkey" PRIMARY KEY (id);
alter table gestao_avaliacoes add constraint "gestao_avaliacoes_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES usuarios(id) ON DELETE CASCADE;
alter table gestao_avaliacoes add constraint "gestao_avaliacoes_lider_id_fkey" FOREIGN KEY (lider_id) REFERENCES usuarios(id);
create index if not exists idx_gestao_avaliacoes_colab ON public.gestao_avaliacoes USING btree (colaborador_id, periodo DESC);
create index if not exists idx_gestao_avaliacoes_lider ON public.gestao_avaliacoes USING btree (lider_id, periodo DESC);

create sequence if not exists gestao_avaliacoes_lider_id_seq;
create table if not exists gestao_avaliacoes_lider (
  "id" bigint default nextval('gestao_avaliacoes_lider_id_seq'::regclass) not null,
  "lider_id" uuid not null,
  "colaborador_id" uuid not null,
  "periodo" text not null,
  "respostas" jsonb default '{}'::jsonb,
  "observacoes" text,
  "anonimo" boolean default true,
  "criado_em" timestamp with time zone default now()
);
alter table gestao_avaliacoes_lider add constraint "gestao_avaliacoes_lider_lider_id_colaborador_id_periodo_key" UNIQUE (lider_id, colaborador_id, periodo);
alter table gestao_avaliacoes_lider add constraint "gestao_avaliacoes_lider_pkey" PRIMARY KEY (id);
alter table gestao_avaliacoes_lider add constraint "gestao_avaliacoes_lider_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES usuarios(id);
alter table gestao_avaliacoes_lider add constraint "gestao_avaliacoes_lider_lider_id_fkey" FOREIGN KEY (lider_id) REFERENCES usuarios(id);

create sequence if not exists gestao_bonus_apuracoes_id_seq;
create table if not exists gestao_bonus_apuracoes (
  "id" bigint default nextval('gestao_bonus_apuracoes_id_seq'::regclass) not null,
  "colaborador_id" uuid not null,
  "periodo" text not null,
  "pontuacao" jsonb default '{}'::jsonb,
  "pontos_total" integer default 0,
  "pontos_max" integer default 0,
  "valor_calculado" numeric(10,2) default 0,
  "pago" boolean default false,
  "data_pagamento" date,
  "observacoes" text,
  "status" text default 'rascunho'::text,
  "criado_em" timestamp with time zone default now(),
  "finalizado_em" timestamp with time zone
);
alter table gestao_bonus_apuracoes add constraint "gestao_bonus_apuracoes_colaborador_id_periodo_key" UNIQUE (colaborador_id, periodo);
alter table gestao_bonus_apuracoes add constraint "gestao_bonus_apuracoes_pkey" PRIMARY KEY (id);
alter table gestao_bonus_apuracoes add constraint "gestao_bonus_apuracoes_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES usuarios(id) ON DELETE CASCADE;
create index if not exists idx_gestao_bonus_apur_colab ON public.gestao_bonus_apuracoes USING btree (colaborador_id, periodo DESC);

create sequence if not exists gestao_bonus_config_id_seq;
create table if not exists gestao_bonus_config (
  "id" bigint default nextval('gestao_bonus_config_id_seq'::regclass) not null,
  "colaborador_id" uuid not null,
  "ativo" boolean default false,
  "valor_max" numeric(10,2) default 0,
  "pontos_max" integer default 0,
  "periodicidade" text default 'mensal'::text,
  "atualizado_em" timestamp with time zone default now()
);
alter table gestao_bonus_config add constraint "gestao_bonus_config_colaborador_id_key" UNIQUE (colaborador_id);
alter table gestao_bonus_config add constraint "gestao_bonus_config_pkey" PRIMARY KEY (id);
alter table gestao_bonus_config add constraint "gestao_bonus_config_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES usuarios(id) ON DELETE CASCADE;

create sequence if not exists gestao_liderados_id_seq;
create table if not exists gestao_liderados (
  "id" bigint default nextval('gestao_liderados_id_seq'::regclass) not null,
  "lider_id" uuid not null,
  "colaborador_id" uuid not null,
  "ativo" boolean default true,
  "data_inicio" date default CURRENT_DATE,
  "data_fim" date,
  "criado_em" timestamp with time zone default now()
);
alter table gestao_liderados add constraint "gestao_liderados_colaborador_id_key" UNIQUE (colaborador_id);
alter table gestao_liderados add constraint "gestao_liderados_pkey" PRIMARY KEY (id);
alter table gestao_liderados add constraint "gestao_liderados_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES usuarios(id) ON DELETE CASCADE;
alter table gestao_liderados add constraint "gestao_liderados_lider_id_fkey" FOREIGN KEY (lider_id) REFERENCES usuarios(id) ON DELETE CASCADE;
create index if not exists idx_gestao_liderados_lider ON public.gestao_liderados USING btree (lider_id) WHERE ativo;
create index if not exists idx_gestao_liderados_colab ON public.gestao_liderados USING btree (colaborador_id) WHERE ativo;

create sequence if not exists gestao_perguntas_id_seq;
create table if not exists gestao_perguntas (
  "id" bigint default nextval('gestao_perguntas_id_seq'::regclass) not null,
  "ordem" integer default 0,
  "bloco" text not null,
  "pergunta" text not null,
  "tipo" text default 'escala'::text not null,
  "obrigatoria" boolean default true,
  "colaborador_id" uuid,
  "criado_por" uuid,
  "ativa" boolean default true,
  "criado_em" timestamp with time zone default now()
);
alter table gestao_perguntas add constraint "gestao_perguntas_pkey" PRIMARY KEY (id);
alter table gestao_perguntas add constraint "gestao_perguntas_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES usuarios(id) ON DELETE CASCADE;
alter table gestao_perguntas add constraint "gestao_perguntas_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES usuarios(id);
create index if not exists idx_gestao_perguntas_colab ON public.gestao_perguntas USING btree (colaborador_id) WHERE ativa;

create sequence if not exists gestao_perguntas_lider_id_seq;
create table if not exists gestao_perguntas_lider (
  "id" bigint default nextval('gestao_perguntas_lider_id_seq'::regclass) not null,
  "ordem" integer default 0,
  "pergunta" text not null,
  "tipo" text default 'escala'::text,
  "ativa" boolean default true
);
alter table gestao_perguntas_lider add constraint "gestao_perguntas_lider_pkey" PRIMARY KEY (id);

create sequence if not exists gestao_tarefas_bonus_id_seq;
create table if not exists gestao_tarefas_bonus (
  "id" bigint default nextval('gestao_tarefas_bonus_id_seq'::regclass) not null,
  "colaborador_id" uuid not null,
  "ordem" integer default 0,
  "descricao" text not null,
  "pontos_max" integer default 0 not null,
  "frequencia" text,
  "ativa" boolean default true,
  "criado_em" timestamp with time zone default now(),
  "atualizado_em" timestamp with time zone default now()
);
alter table gestao_tarefas_bonus add constraint "gestao_tarefas_bonus_pkey" PRIMARY KEY (id);
alter table gestao_tarefas_bonus add constraint "gestao_tarefas_bonus_colaborador_id_fkey" FOREIGN KEY (colaborador_id) REFERENCES usuarios(id) ON DELETE CASCADE;
create index if not exists idx_gestao_tarefas_colab ON public.gestao_tarefas_bonus USING btree (colaborador_id) WHERE ativa;

create table if not exists horarios_livres (
  "id" uuid default gen_random_uuid() not null,
  "usuario_id" uuid,
  "semana" date not null,
  "dia" text not null,
  "hora_inicio" time without time zone not null,
  "hora_fim" time without time zone,
  "criado_em" timestamp with time zone default now()
);
alter table horarios_livres add constraint "horarios_livres_pkey" PRIMARY KEY (id);
alter table horarios_livres add constraint "horarios_livres_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
create index if not exists idx_horarios_semana ON public.horarios_livres USING btree (semana, usuario_id);

create sequence if not exists ia_jobs_id_seq;
create table if not exists ia_jobs (
  "id" bigint default nextval('ia_jobs_id_seq'::regclass) not null,
  "job_id" text not null,
  "status" text default 'gerando'::text not null,
  "resultado" text,
  "tokens" integer default 0,
  "modelo" text,
  "erro" text,
  "criado_em" timestamp with time zone default now() not null,
  "atualizado_em" timestamp with time zone default now() not null
);
alter table ia_jobs add constraint "ia_jobs_job_id_key" UNIQUE (job_id);
alter table ia_jobs add constraint "ia_jobs_pkey" PRIMARY KEY (id);
create index if not exists idx_ia_jobs_job_id ON public.ia_jobs USING btree (job_id);
create index if not exists idx_ia_jobs_status_criado ON public.ia_jobs USING btree (status, criado_em DESC);

create table if not exists notificacoes (
  "id" uuid default gen_random_uuid() not null,
  "usuario_id" uuid,
  "tipo" text not null,
  "titulo" text not null,
  "mensagem" text,
  "lida" boolean default false,
  "referencia_id" uuid,
  "referencia_tipo" text,
  "criado_em" timestamp with time zone default now()
);
alter table notificacoes add constraint "notificacoes_pkey" PRIMARY KEY (id);
alter table notificacoes add constraint "notificacoes_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
create index if not exists idx_notificacoes_usuario ON public.notificacoes USING btree (usuario_id);

create table if not exists notificacoes_email (
  "id" uuid default gen_random_uuid() not null,
  "processo_id" uuid,
  "email_destino" text not null,
  "assunto" text,
  "status" text default 'enviado'::text,
  "enviado_em" timestamp with time zone default now()
);
alter table notificacoes_email add constraint "notificacoes_email_pkey" PRIMARY KEY (id);
alter table notificacoes_email add constraint "notificacoes_email_processo_id_fkey" FOREIGN KEY (processo_id) REFERENCES processos(id);

create table if not exists notificacoes_falha (
  "id" uuid default gen_random_uuid() not null,
  "email_destinatario" text not null,
  "tipo_erro" text,
  "mensagem_erro" text,
  "origem_sistema" text,
  "origem_protocolo" text,
  "cadastrado_por_nome" text,
  "cadastrado_por_id" uuid,
  "recebido_em" timestamp with time zone default now(),
  "processado_em" timestamp with time zone default now(),
  "hash_bounce" text,
  "status" text default 'aberto'::text,
  "resolvido_em" timestamp with time zone,
  "resolvido_por" uuid,
  "observacoes" text,
  "criado_em" timestamp with time zone default now()
);
alter table notificacoes_falha add constraint "notificacoes_falha_hash_bounce_key" UNIQUE (hash_bounce);
alter table notificacoes_falha add constraint "notificacoes_falha_pkey" PRIMARY KEY (id);
alter table notificacoes_falha add constraint "notificacoes_falha_cadastrado_por_id_fkey" FOREIGN KEY (cadastrado_por_id) REFERENCES usuarios(id) ON DELETE SET NULL;
alter table notificacoes_falha add constraint "notificacoes_falha_resolvido_por_fkey" FOREIGN KEY (resolvido_por) REFERENCES usuarios(id);
alter table notificacoes_falha add constraint "notificacoes_falha_status_check" CHECK ((status = ANY (ARRAY['aberto'::text, 'lido'::text, 'resolvido'::text, 'ignorado'::text])));
create index if not exists idx_notif_falha_status ON public.notificacoes_falha USING btree (status);
create index if not exists idx_notif_falha_origem ON public.notificacoes_falha USING btree (origem_sistema);
create index if not exists idx_notif_falha_quem ON public.notificacoes_falha USING btree (cadastrado_por_id);
create index if not exists idx_notif_falha_recebido ON public.notificacoes_falha USING btree (recebido_em DESC);

create table if not exists pauta_reunioes (
  "id" uuid default gen_random_uuid() not null,
  "tipo" text not null,
  "semana" date not null,
  "item" text not null,
  "responsavel_id" uuid,
  "status" text default 'Pendente'::text,
  "criado_por_id" uuid,
  "criado_em" timestamp with time zone default now()
);
alter table pauta_reunioes add constraint "pauta_reunioes_pkey" PRIMARY KEY (id);
alter table pauta_reunioes add constraint "pauta_reunioes_criado_por_id_fkey" FOREIGN KEY (criado_por_id) REFERENCES usuarios(id);
alter table pauta_reunioes add constraint "pauta_reunioes_responsavel_id_fkey" FOREIGN KEY (responsavel_id) REFERENCES usuarios(id);
create index if not exists idx_pauta_semana ON public.pauta_reunioes USING btree (semana, tipo);

create table if not exists prazos (
  "id" uuid default gen_random_uuid() not null,
  "processo_id" uuid,
  "referencia" text,
  "tipo" text not null,
  "modulo" text default 'judicial'::text,
  "responsavel_id" uuid,
  "vencimento" date not null,
  "concluido" boolean default false,
  "observacoes" text,
  "criado_em" timestamp with time zone default now()
);
alter table prazos add constraint "prazos_pkey" PRIMARY KEY (id);
alter table prazos add constraint "prazos_processo_id_fkey" FOREIGN KEY (processo_id) REFERENCES processos(id);
alter table prazos add constraint "prazos_responsavel_id_fkey" FOREIGN KEY (responsavel_id) REFERENCES usuarios(id);
create index if not exists idx_prazos_vencimento ON public.prazos USING btree (vencimento);
create index if not exists idx_prazos_responsavel ON public.prazos USING btree (responsavel_id);

create table if not exists processos (
  "id" uuid default gen_random_uuid() not null,
  "numero" text not null,
  "tipo" text not null,
  "vara" text,
  "fase" text,
  "autor" text,
  "reu" text,
  "valor_causa" numeric(15,2),
  "responsavel_id" uuid,
  "status" text default 'ativo'::text,
  "criado_em" timestamp with time zone default now(),
  "atualizado_em" timestamp with time zone default now(),
  "observacoes_internas" text,
  "providencias" text,
  "email_cliente" text,
  "nome_cliente" text,
  "notif_email_ativo" boolean default false,
  "ultima_sync_cnj" timestamp with time zone,
  "ultimo_mov_cnj" timestamp with time zone
);
alter table processos add constraint "processos_pkey" PRIMARY KEY (id);
alter table processos add constraint "processos_responsavel_id_fkey" FOREIGN KEY (responsavel_id) REFERENCES usuarios(id);
create index if not exists idx_processos_responsavel ON public.processos USING btree (responsavel_id);

create table if not exists requisicoes_internas (
  "id" uuid default gen_random_uuid() not null,
  "protocolo" text not null,
  "agencia" text,
  "tipo" text,
  "descricao" text not null,
  "urgencia" text default 'Normal'::text,
  "status" text default 'Aberto'::text,
  "responsavel_id" uuid,
  "solicitante_id" uuid,
  "observacoes" text,
  "criado_em" timestamp with time zone default now(),
  "atualizado_em" timestamp with time zone default now()
);
alter table requisicoes_internas add constraint "requisicoes_internas_protocolo_key" UNIQUE (protocolo);
alter table requisicoes_internas add constraint "requisicoes_internas_pkey" PRIMARY KEY (id);
alter table requisicoes_internas add constraint "requisicoes_internas_responsavel_id_fkey" FOREIGN KEY (responsavel_id) REFERENCES usuarios(id);
alter table requisicoes_internas add constraint "requisicoes_internas_solicitante_id_fkey" FOREIGN KEY (solicitante_id) REFERENCES usuarios(id);
create index if not exists idx_requisicoes_status ON public.requisicoes_internas USING btree (status);

create table if not exists spatial_ref_sys (
  "srid" integer not null,
  "auth_name" character varying(256),
  "auth_srid" integer,
  "srtext" character varying(2048),
  "proj4text" character varying(2048)
);
alter table spatial_ref_sys add constraint "spatial_ref_sys_pkey" PRIMARY KEY (srid);
alter table spatial_ref_sys add constraint "spatial_ref_sys_srid_check" CHECK (((srid > 0) AND (srid <= 998999)));

create table if not exists tarefas (
  "id" uuid default gen_random_uuid() not null,
  "titulo" text not null,
  "status" text default 'Não iniciado'::text,
  "prioridade" text default 'N.U./IMP.'::text,
  "categoria" text default 'Pontual'::text,
  "prazo" date,
  "responsavel_id" uuid,
  "delegado_para_id" uuid,
  "observacoes" text,
  "criado_em" timestamp with time zone default now(),
  "atualizado_em" timestamp with time zone default now()
);
alter table tarefas add constraint "tarefas_pkey" PRIMARY KEY (id);
alter table tarefas add constraint "tarefas_delegado_para_id_fkey" FOREIGN KEY (delegado_para_id) REFERENCES usuarios(id);
alter table tarefas add constraint "tarefas_responsavel_id_fkey" FOREIGN KEY (responsavel_id) REFERENCES usuarios(id);
create index if not exists idx_tarefas_responsavel ON public.tarefas USING btree (responsavel_id);
create index if not exists idx_tarefas_status ON public.tarefas USING btree (status);
create index if not exists idx_tarefas_prazo ON public.tarefas USING btree (prazo);

create table if not exists usuarios (
  "id" uuid default gen_random_uuid() not null,
  "nome" text not null,
  "email" text not null,
  "nivel" integer not null,
  "judicial" boolean default false,
  "admin" boolean default false,
  "quota_tokens" integer default 100000,
  "tokens_usados" integer default 0,
  "ativo" boolean default true,
  "criado_em" timestamp with time zone default now(),
  "acesso_juridico" boolean default false,
  "acesso_interno" boolean default false,
  "acesso_calendar" boolean default false,
  "pin_calendar" text,
  "dept" text,
  "cor_avatar" text default '#1E2D4A'::text,
  "senha_hash" text,
  "primeiro_acesso" boolean default true
);
alter table usuarios add constraint "usuarios_email_key" UNIQUE (email);
alter table usuarios add constraint "usuarios_pkey" PRIMARY KEY (id);
alter table usuarios add constraint "usuarios_nivel_check" CHECK ((nivel = ANY (ARRAY[1, 2, 3])));

create table if not exists vendas_agenda_fotografo (
  "id" uuid default gen_random_uuid() not null,
  "data" date not null,
  "hora" text not null,
  "codigo_imovel" text,
  "endereco" text,
  "unidade" text,
  "corretor" text,
  "telefone" text,
  "regiao" text,
  "observacoes" text,
  "status" text default 'agendado'::text,
  "criado_em" timestamp with time zone default now(),
  "criado_por_id" uuid,
  "tipo" text default 'geral'::text,
  "imovel_vago" boolean default false,
  "chaves_portaria" boolean default false,
  "confirmado" boolean default false,
  "confirmado_em" timestamp with time zone,
  "confirmado_por_id" uuid
);
alter table vendas_agenda_fotografo add constraint "vendas_agenda_fotografo_data_hora_key" UNIQUE (data, hora);
alter table vendas_agenda_fotografo add constraint "vendas_agenda_fotografo_pkey" PRIMARY KEY (id);
alter table vendas_agenda_fotografo add constraint "vendas_agenda_fotografo_confirmado_por_id_fkey" FOREIGN KEY (confirmado_por_id) REFERENCES usuarios(id);
alter table vendas_agenda_fotografo add constraint "vendas_agenda_fotografo_criado_por_id_fkey" FOREIGN KEY (criado_por_id) REFERENCES usuarios(id);
alter table vendas_agenda_fotografo add constraint "vendas_agenda_fotografo_status_check" CHECK ((status = ANY (ARRAY['agendado'::text, 'realizado'::text, 'cancelado'::text, 'livre'::text])));
alter table vendas_agenda_fotografo add constraint "vendas_agenda_fotografo_tipo_check" CHECK ((tipo = ANY (ARRAY['selecao'::text, 'geral'::text])));
create index if not exists idx_foto_data ON public.vendas_agenda_fotografo USING btree (data);

create table if not exists vendas_atividades (
  "id" uuid default gen_random_uuid() not null,
  "mes" text not null,
  "tipo" text,
  "nome" text not null,
  "data" date,
  "hora" text,
  "local" text,
  "equipe" text,
  "observacoes" text,
  "criado_em" timestamp with time zone default now(),
  "criado_por_id" uuid
);
alter table vendas_atividades add constraint "vendas_atividades_pkey" PRIMARY KEY (id);
alter table vendas_atividades add constraint "vendas_atividades_criado_por_id_fkey" FOREIGN KEY (criado_por_id) REFERENCES usuarios(id);
create index if not exists idx_atv_mes ON public.vendas_atividades USING btree (mes);
create index if not exists idx_atv_tipo ON public.vendas_atividades USING btree (tipo);
create index if not exists idx_atv_equipe ON public.vendas_atividades USING btree (equipe);

create table if not exists vendas_corretores (
  "id" uuid default gen_random_uuid() not null,
  "nome" text not null,
  "equipe" text not null,
  "ativo" boolean default true,
  "criado_em" timestamp with time zone default now(),
  "criado_por" text,
  "atualizado_em" timestamp with time zone default now()
);
alter table vendas_corretores add constraint "vendas_corretores_pkey" PRIMARY KEY (id);
alter table vendas_corretores add constraint "chk_equipe" CHECK ((equipe = ANY (ARRAY['Aguia'::text, 'Chris'::text, 'Emilia'::text, 'Felippe'::text, 'Fenix'::text])));
create unique index if not exists uniq_corretor_por_equipe ON public.vendas_corretores USING btree (equipe, lower(nome)) WHERE (ativo = true);
create index if not exists idx_corretor_equipe ON public.vendas_corretores USING btree (equipe, ativo);

create table if not exists vendas_cotas (
  "id" uuid default gen_random_uuid() not null,
  "mes" text not null,
  "corretor_nome" text not null,
  "equipe" text,
  "super_destaque" integer default 0,
  "destaque_comum" integer default 0,
  "total_anuncios" integer default 0,
  "observacoes" text,
  "criado_em" timestamp with time zone default now(),
  "atualizado_em" timestamp with time zone default now()
);
alter table vendas_cotas add constraint "vendas_cotas_mes_corretor_nome_key" UNIQUE (mes, corretor_nome);
alter table vendas_cotas add constraint "vendas_cotas_pkey" PRIMARY KEY (id);
create index if not exists idx_cota_mes ON public.vendas_cotas USING btree (mes);
create index if not exists idx_cota_equipe ON public.vendas_cotas USING btree (equipe);

create table if not exists vendas_forum_apoios (
  "id" uuid default gen_random_uuid() not null,
  "topico_id" uuid not null,
  "autor_nome" text not null,
  "criado_em" timestamp with time zone default now()
);
alter table vendas_forum_apoios add constraint "vendas_forum_apoios_topico_id_autor_nome_key" UNIQUE (topico_id, autor_nome);
alter table vendas_forum_apoios add constraint "vendas_forum_apoios_pkey" PRIMARY KEY (id);
alter table vendas_forum_apoios add constraint "vendas_forum_apoios_topico_id_fkey" FOREIGN KEY (topico_id) REFERENCES vendas_forum_topicos(id) ON DELETE CASCADE;

create table if not exists vendas_forum_ciclos (
  "id" uuid default gen_random_uuid() not null,
  "trimestre" smallint not null,
  "ano" smallint not null,
  "data_reuniao" date,
  "encerrado" boolean default false,
  "criado_em" timestamp with time zone default now()
);
alter table vendas_forum_ciclos add constraint "vendas_forum_ciclos_trimestre_ano_key" UNIQUE (trimestre, ano);
alter table vendas_forum_ciclos add constraint "vendas_forum_ciclos_pkey" PRIMARY KEY (id);
alter table vendas_forum_ciclos add constraint "chk_trim" CHECK (((trimestre >= 1) AND (trimestre <= 4)));

create table if not exists vendas_forum_comentarios (
  "id" uuid default gen_random_uuid() not null,
  "topico_id" uuid not null,
  "texto" text not null,
  "autor_nome" text,
  "autor_equipe" text,
  "criado_em" timestamp with time zone default now()
);
alter table vendas_forum_comentarios add constraint "vendas_forum_comentarios_pkey" PRIMARY KEY (id);
alter table vendas_forum_comentarios add constraint "vendas_forum_comentarios_topico_id_fkey" FOREIGN KEY (topico_id) REFERENCES vendas_forum_topicos(id) ON DELETE CASCADE;
create index if not exists idx_forum_com_topico ON public.vendas_forum_comentarios USING btree (topico_id, criado_em);

create table if not exists vendas_forum_topicos (
  "id" uuid default gen_random_uuid() not null,
  "trimestre" smallint not null,
  "ano" smallint not null,
  "titulo" text not null,
  "descricao" text,
  "tag" text,
  "status" text default 'proposta'::text,
  "deliberacao" text,
  "autor_nome" text,
  "autor_equipe" text,
  "criado_em" timestamp with time zone default now(),
  "atualizado_em" timestamp with time zone default now(),
  "decisao_votacao" text,
  "tipo" text default 'votacao'::text,
  "prazo_votacao" date
);
alter table vendas_forum_topicos add constraint "vendas_forum_topicos_pkey" PRIMARY KEY (id);
alter table vendas_forum_topicos add constraint "chk_trim2" CHECK (((trimestre >= 1) AND (trimestre <= 4)));
alter table vendas_forum_topicos add constraint "vendas_forum_topicos_decisao_votacao_check" CHECK ((decisao_votacao = ANY (ARRAY['aprovado'::text, 'reprovado'::text])));
alter table vendas_forum_topicos add constraint "vendas_forum_topicos_tipo_check" CHECK ((tipo = ANY (ARRAY['votacao'::text, 'discussao'::text])));
create index if not exists idx_forum_top_trim ON public.vendas_forum_topicos USING btree (ano DESC, trimestre DESC);
create index if not exists idx_forum_top_status ON public.vendas_forum_topicos USING btree (status);

create table if not exists vendas_forum_votos (
  "id" uuid default gen_random_uuid() not null,
  "topico_id" uuid not null,
  "autor_nome" text not null,
  "voto" text not null,
  "criado_em" timestamp with time zone default now()
);
alter table vendas_forum_votos add constraint "vendas_forum_votos_topico_id_autor_nome_key" UNIQUE (topico_id, autor_nome);
alter table vendas_forum_votos add constraint "vendas_forum_votos_pkey" PRIMARY KEY (id);
alter table vendas_forum_votos add constraint "vendas_forum_votos_topico_id_fkey" FOREIGN KEY (topico_id) REFERENCES vendas_forum_topicos(id) ON DELETE CASCADE;
alter table vendas_forum_votos add constraint "vendas_forum_votos_voto_check" CHECK ((voto = ANY (ARRAY['aprovar'::text, 'reprovar'::text])));
create index if not exists idx_forum_votos_topico ON public.vendas_forum_votos USING btree (topico_id);

create table if not exists vendas_fotografo_disponibilidade (
  "id" uuid default gen_random_uuid() not null,
  "data" date not null,
  "hora_inicio" time without time zone not null,
  "hora_fim" time without time zone not null,
  "regiao" text,
  "observacoes" text,
  "criado_por" text,
  "criado_em" timestamp with time zone default now()
);
alter table vendas_fotografo_disponibilidade add constraint "vendas_fotografo_disponibilidade_pkey" PRIMARY KEY (id);
alter table vendas_fotografo_disponibilidade add constraint "chk_horas" CHECK ((hora_fim > hora_inicio));
create index if not exists idx_foto_disp_data ON public.vendas_fotografo_disponibilidade USING btree (data);

create table if not exists vendas_presencas (
  "id" uuid default gen_random_uuid() not null,
  "atividade_id" uuid not null,
  "corretor_nome" text not null,
  "equipe" text,
  "presente" boolean default true,
  "observacao" text,
  "marcado_em" timestamp with time zone default now(),
  "marcado_por_id" uuid
);
alter table vendas_presencas add constraint "vendas_presencas_atividade_id_corretor_nome_key" UNIQUE (atividade_id, corretor_nome);
alter table vendas_presencas add constraint "vendas_presencas_pkey" PRIMARY KEY (id);
alter table vendas_presencas add constraint "vendas_presencas_atividade_id_fkey" FOREIGN KEY (atividade_id) REFERENCES vendas_atividades(id) ON DELETE CASCADE;
alter table vendas_presencas add constraint "vendas_presencas_marcado_por_id_fkey" FOREIGN KEY (marcado_por_id) REFERENCES usuarios(id);
create index if not exists idx_pres_atividade ON public.vendas_presencas USING btree (atividade_id);
create index if not exists idx_pres_corretor ON public.vendas_presencas USING btree (corretor_nome);
create index if not exists idx_pres_equipe ON public.vendas_presencas USING btree (equipe);

create table if not exists vendas_selecao_imoveis (
  "id" uuid default gen_random_uuid() not null,
  "codigo" text not null,
  "endereco" text,
  "metragem" numeric(8,2),
  "tempo_venda" text,
  "outras_opcoes" text,
  "corretor" text,
  "equipe" text,
  "enviado_por_id" uuid,
  "enviado_em" timestamp with time zone default now(),
  "status" text default 'pendente'::text,
  "aprovado_em" timestamp with time zone,
  "aprovado_por_id" uuid,
  "motivo_reprovacao" text,
  "ativo_ate" date,
  "observacoes" text,
  "criado_em" timestamp with time zone default now(),
  "atualizado_em" timestamp with time zone default now(),
  "mes_referencia" text,
  "link_imovel" text
);
alter table vendas_selecao_imoveis add constraint "vendas_selecao_imoveis_pkey" PRIMARY KEY (id);
alter table vendas_selecao_imoveis add constraint "vendas_selecao_imoveis_aprovado_por_id_fkey" FOREIGN KEY (aprovado_por_id) REFERENCES usuarios(id);
alter table vendas_selecao_imoveis add constraint "vendas_selecao_imoveis_enviado_por_id_fkey" FOREIGN KEY (enviado_por_id) REFERENCES usuarios(id);
alter table vendas_selecao_imoveis add constraint "vendas_selecao_imoveis_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'aprovado'::text, 'reprovado'::text, 'vendido'::text, 'expirado'::text, 'removido'::text])));
create index if not exists idx_sel_status ON public.vendas_selecao_imoveis USING btree (status);
create index if not exists idx_sel_equipe ON public.vendas_selecao_imoveis USING btree (equipe);
create index if not exists idx_sel_ativo_ate ON public.vendas_selecao_imoveis USING btree (ativo_ate);
create index if not exists idx_sel_codigo ON public.vendas_selecao_imoveis USING btree (codigo);
create unique index if not exists uniq_selecao_codigo_aprovado ON public.vendas_selecao_imoveis USING btree (codigo) WHERE (status = 'aprovado'::text);

create table if not exists vendas_selecao_votos (
  "id" uuid default gen_random_uuid() not null,
  "imovel_id" uuid not null,
  "votante_nome" text not null,
  "voto" text not null,
  "observacao" text,
  "votado_em" timestamp with time zone default now(),
  "votado_por_id" uuid
);
alter table vendas_selecao_votos add constraint "vendas_selecao_votos_imovel_id_votante_nome_key" UNIQUE (imovel_id, votante_nome);
alter table vendas_selecao_votos add constraint "vendas_selecao_votos_pkey" PRIMARY KEY (id);
alter table vendas_selecao_votos add constraint "vendas_selecao_votos_imovel_id_fkey" FOREIGN KEY (imovel_id) REFERENCES vendas_selecao_imoveis(id) ON DELETE CASCADE;
alter table vendas_selecao_votos add constraint "vendas_selecao_votos_votado_por_id_fkey" FOREIGN KEY (votado_por_id) REFERENCES usuarios(id);
alter table vendas_selecao_votos add constraint "vendas_selecao_votos_voto_check" CHECK ((voto = ANY (ARRAY['aprovado'::text, 'reprovado'::text])));
create index if not exists idx_voto_imovel ON public.vendas_selecao_votos USING btree (imovel_id);

-- RLS: mesma política da produção (acesso autenticado)
alter table acordos_extrajudiciais enable row level security;
drop policy if exists acesso_autenticado on acordos_extrajudiciais;
create policy acesso_autenticado on acordos_extrajudiciais for all to authenticated using (true) with check (true);
alter table agenda_eventos enable row level security;
drop policy if exists acesso_autenticado on agenda_eventos;
create policy acesso_autenticado on agenda_eventos for all to authenticated using (true) with check (true);
alter table andamentos_manutencao enable row level security;
drop policy if exists acesso_autenticado on andamentos_manutencao;
create policy acesso_autenticado on andamentos_manutencao for all to authenticated using (true) with check (true);
alter table andamentos_processos enable row level security;
drop policy if exists acesso_autenticado on andamentos_processos;
create policy acesso_autenticado on andamentos_processos for all to authenticated using (true) with check (true);
alter table atividades_semanais enable row level security;
drop policy if exists acesso_autenticado on atividades_semanais;
create policy acesso_autenticado on atividades_semanais for all to authenticated using (true) with check (true);
alter table atividades_semanais_check enable row level security;
drop policy if exists acesso_autenticado on atividades_semanais_check;
create policy acesso_autenticado on atividades_semanais_check for all to authenticated using (true) with check (true);
alter table calculos_atualizacao enable row level security;
drop policy if exists acesso_autenticado on calculos_atualizacao;
create policy acesso_autenticado on calculos_atualizacao for all to authenticated using (true) with check (true);
alter table chamados enable row level security;
drop policy if exists acesso_autenticado on chamados;
create policy acesso_autenticado on chamados for all to authenticated using (true) with check (true);
alter table chamados_manutencao enable row level security;
drop policy if exists acesso_autenticado on chamados_manutencao;
create policy acesso_autenticado on chamados_manutencao for all to authenticated using (true) with check (true);
alter table check_semanal enable row level security;
drop policy if exists acesso_autenticado on check_semanal;
create policy acesso_autenticado on check_semanal for all to authenticated using (true) with check (true);
alter table documentos enable row level security;
drop policy if exists acesso_autenticado on documentos;
create policy acesso_autenticado on documentos for all to authenticated using (true) with check (true);
alter table financeiro enable row level security;
drop policy if exists acesso_autenticado on financeiro;
create policy acesso_autenticado on financeiro for all to authenticated using (true) with check (true);
alter table gestao_avaliacoes enable row level security;
drop policy if exists acesso_autenticado on gestao_avaliacoes;
create policy acesso_autenticado on gestao_avaliacoes for all to authenticated using (true) with check (true);
alter table gestao_avaliacoes_lider enable row level security;
drop policy if exists acesso_autenticado on gestao_avaliacoes_lider;
create policy acesso_autenticado on gestao_avaliacoes_lider for all to authenticated using (true) with check (true);
alter table gestao_bonus_apuracoes enable row level security;
drop policy if exists acesso_autenticado on gestao_bonus_apuracoes;
create policy acesso_autenticado on gestao_bonus_apuracoes for all to authenticated using (true) with check (true);
alter table gestao_bonus_config enable row level security;
drop policy if exists acesso_autenticado on gestao_bonus_config;
create policy acesso_autenticado on gestao_bonus_config for all to authenticated using (true) with check (true);
alter table gestao_liderados enable row level security;
drop policy if exists acesso_autenticado on gestao_liderados;
create policy acesso_autenticado on gestao_liderados for all to authenticated using (true) with check (true);
alter table gestao_perguntas enable row level security;
drop policy if exists acesso_autenticado on gestao_perguntas;
create policy acesso_autenticado on gestao_perguntas for all to authenticated using (true) with check (true);
alter table gestao_perguntas_lider enable row level security;
drop policy if exists acesso_autenticado on gestao_perguntas_lider;
create policy acesso_autenticado on gestao_perguntas_lider for all to authenticated using (true) with check (true);
alter table gestao_tarefas_bonus enable row level security;
drop policy if exists acesso_autenticado on gestao_tarefas_bonus;
create policy acesso_autenticado on gestao_tarefas_bonus for all to authenticated using (true) with check (true);
alter table horarios_livres enable row level security;
drop policy if exists acesso_autenticado on horarios_livres;
create policy acesso_autenticado on horarios_livres for all to authenticated using (true) with check (true);
alter table ia_jobs enable row level security;
drop policy if exists acesso_autenticado on ia_jobs;
create policy acesso_autenticado on ia_jobs for all to authenticated using (true) with check (true);
alter table notificacoes enable row level security;
drop policy if exists acesso_autenticado on notificacoes;
create policy acesso_autenticado on notificacoes for all to authenticated using (true) with check (true);
alter table notificacoes_email enable row level security;
drop policy if exists acesso_autenticado on notificacoes_email;
create policy acesso_autenticado on notificacoes_email for all to authenticated using (true) with check (true);
alter table notificacoes_falha enable row level security;
drop policy if exists acesso_autenticado on notificacoes_falha;
create policy acesso_autenticado on notificacoes_falha for all to authenticated using (true) with check (true);
alter table pauta_reunioes enable row level security;
drop policy if exists acesso_autenticado on pauta_reunioes;
create policy acesso_autenticado on pauta_reunioes for all to authenticated using (true) with check (true);
alter table prazos enable row level security;
drop policy if exists acesso_autenticado on prazos;
create policy acesso_autenticado on prazos for all to authenticated using (true) with check (true);
alter table processos enable row level security;
drop policy if exists acesso_autenticado on processos;
create policy acesso_autenticado on processos for all to authenticated using (true) with check (true);
alter table requisicoes_internas enable row level security;
drop policy if exists acesso_autenticado on requisicoes_internas;
create policy acesso_autenticado on requisicoes_internas for all to authenticated using (true) with check (true);
alter table spatial_ref_sys enable row level security;
drop policy if exists acesso_autenticado on spatial_ref_sys;
create policy acesso_autenticado on spatial_ref_sys for all to authenticated using (true) with check (true);
alter table tarefas enable row level security;
drop policy if exists acesso_autenticado on tarefas;
create policy acesso_autenticado on tarefas for all to authenticated using (true) with check (true);
alter table usuarios enable row level security;
drop policy if exists acesso_autenticado on usuarios;
create policy acesso_autenticado on usuarios for all to authenticated using (true) with check (true);
alter table vendas_agenda_fotografo enable row level security;
drop policy if exists acesso_autenticado on vendas_agenda_fotografo;
create policy acesso_autenticado on vendas_agenda_fotografo for all to authenticated using (true) with check (true);
alter table vendas_atividades enable row level security;
drop policy if exists acesso_autenticado on vendas_atividades;
create policy acesso_autenticado on vendas_atividades for all to authenticated using (true) with check (true);
alter table vendas_corretores enable row level security;
drop policy if exists acesso_autenticado on vendas_corretores;
create policy acesso_autenticado on vendas_corretores for all to authenticated using (true) with check (true);
alter table vendas_cotas enable row level security;
drop policy if exists acesso_autenticado on vendas_cotas;
create policy acesso_autenticado on vendas_cotas for all to authenticated using (true) with check (true);
alter table vendas_forum_apoios enable row level security;
drop policy if exists acesso_autenticado on vendas_forum_apoios;
create policy acesso_autenticado on vendas_forum_apoios for all to authenticated using (true) with check (true);
alter table vendas_forum_ciclos enable row level security;
drop policy if exists acesso_autenticado on vendas_forum_ciclos;
create policy acesso_autenticado on vendas_forum_ciclos for all to authenticated using (true) with check (true);
alter table vendas_forum_comentarios enable row level security;
drop policy if exists acesso_autenticado on vendas_forum_comentarios;
create policy acesso_autenticado on vendas_forum_comentarios for all to authenticated using (true) with check (true);
alter table vendas_forum_topicos enable row level security;
drop policy if exists acesso_autenticado on vendas_forum_topicos;
create policy acesso_autenticado on vendas_forum_topicos for all to authenticated using (true) with check (true);
alter table vendas_forum_votos enable row level security;
drop policy if exists acesso_autenticado on vendas_forum_votos;
create policy acesso_autenticado on vendas_forum_votos for all to authenticated using (true) with check (true);
alter table vendas_fotografo_disponibilidade enable row level security;
drop policy if exists acesso_autenticado on vendas_fotografo_disponibilidade;
create policy acesso_autenticado on vendas_fotografo_disponibilidade for all to authenticated using (true) with check (true);
alter table vendas_presencas enable row level security;
drop policy if exists acesso_autenticado on vendas_presencas;
create policy acesso_autenticado on vendas_presencas for all to authenticated using (true) with check (true);
alter table vendas_selecao_imoveis enable row level security;
drop policy if exists acesso_autenticado on vendas_selecao_imoveis;
create policy acesso_autenticado on vendas_selecao_imoveis for all to authenticated using (true) with check (true);
alter table vendas_selecao_votos enable row level security;
drop policy if exists acesso_autenticado on vendas_selecao_votos;
create policy acesso_autenticado on vendas_selecao_votos for all to authenticated using (true) with check (true);
