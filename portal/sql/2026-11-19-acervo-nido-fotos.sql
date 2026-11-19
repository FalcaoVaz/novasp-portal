-- ═══════════════════════════════════════════════════════════════
-- ACERVO NIDO — FOTOS (19/11/2026)
-- As fotos dos imóveis do NIDO (backup de 06/11/2026, 1,78 mi fotos) ficam SÓ no Skybox, em pacotes zip
-- (pasta "backup NIDO 2026-11-06/fotos/fotos-NNNN.zip"). Esta tabela guarda onde cada foto está dentro do pacote,
-- para a função falcaovaz.netlify.app/.netlify/functions/nido-foto ler só os bytes daquela foto (Range) e entregar
-- ao portal. Nada de foto é copiado para o Supabase.
-- Quem vê: a mesma regra do Acervo Nido (nido_pode_ler). A função consulta esta tabela COM O LOGIN de quem pede,
-- então quem não tem acesso ao Acervo não recebe foto nenhuma.
-- Rodar ANTES da carga (nido-backup/ferramentas/carregar_indice_fotos.py --gravar). Pode rodar de novo.
-- ═══════════════════════════════════════════════════════════════
create table if not exists nido_fotos (
  ref      text     not null,          -- referência do imóvel no NIDO (= nido_imoveis.chave_imovel)
  ordem    smallint not null,          -- 1..N, na ordem das fotos no NIDO
  pacote   smallint not null,          -- NNNN de fotos/fotos-NNNN.zip
  off      bigint   not null,          -- posição do cabeçalho local da foto no zip
  tam      integer  not null,          -- bytes gravados no zip
  metodo   smallint not null default 0, -- 0 = guardado, 8 = comprimido
  primary key (ref, ordem)
);

alter table nido_fotos enable row level security;
revoke all on nido_fotos from anon, authenticated;
grant select on nido_fotos to authenticated;
drop policy if exists acervo_nido_fotos on nido_fotos;
create policy acervo_nido_fotos on nido_fotos for select to authenticated using (nido_pode_ler());

select 'ok — Acervo Nido: tabela nido_fotos' as status, count(*) as fotos from nido_fotos;
