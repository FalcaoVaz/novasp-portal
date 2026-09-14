-- ─── COLUNAS DJEN ────────────────────────────────────────
-- Adiciona campos para capturar texto integral de despachos, decisoes e
-- sentencas vindos da API publica do DJEN (Diario de Justica Eletronico
-- Nacional do CNJ). Cada item do DJEN tem um id estavel, usamos como
-- chave de dedup.

alter table public.andamentos_processos
  add column if not exists texto_completo  text,
  add column if not exists id_comunicacao  bigint,
  add column if not exists tipo_documento  text,
  add column if not exists link_origem     text;

-- Dedup por (processo_id, id_comunicacao). Index parcial — so quando
-- houver id_comunicacao, ja que andamentos manuais nao tem.
create unique index if not exists ux_andamento_djen_dedup
  on public.andamentos_processos (processo_id, id_comunicacao)
  where id_comunicacao is not null;

-- Indice para busca por texto completo (futuro: usar tsvector se virar gargalo)
create index if not exists idx_andamento_tipo_doc
  on public.andamentos_processos (tipo_documento)
  where tipo_documento is not null;
