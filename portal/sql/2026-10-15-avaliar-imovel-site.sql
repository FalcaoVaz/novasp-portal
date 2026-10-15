-- ═══════════════════════════════════════════════════════════════
-- "AVALIAR ESTE IMÓVEL" NA ÁREA DO CORRETOR (site → portal → site) — 15/10/2026.
-- Handover da sessão do site (HANDOFF-AVALIACAO-IMOVEL-AREA-CORRETOR-20261015.md).
--   ida:   o passe do site traz "imovel" e "retorno"; a função sso-corretor guarda em sso_prefill e o portal busca por id
--          (aval_prefill_pegar) para abrir a avaliação já preenchida — nada de dados do imóvel na URL do login.
--   volta: o portal gera o PDF do dossiê, sobe no bucket privado "dossies" (pasta = e-mail do corretor) e a função
--          sso-retorno assina o passe de volta; sso_avaliacao_ref mantém o MESMO avaliacao_id por (corretor, ref).
-- Rodar no SQL Editor do falcaovaz-juridico. Pode rodar de novo.
-- ═══════════════════════════════════════════════════════════════
begin;

-- 1) Dados do imóvel vindos do site (só a função grava; o portal lê pela função abaixo, 1 hora de validade)
create table if not exists sso_prefill (
  id uuid primary key default gen_random_uuid(),
  email text not null, imovel jsonb not null, retorno text, criado_em timestamptz not null default now(), usado_em timestamptz);
alter table sso_prefill enable row level security;
revoke all on sso_prefill from anon, authenticated;

create or replace function aval_prefill_pegar(p_id uuid) returns table(imovel jsonb, retorno text)
language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  update sso_prefill set usado_em = coalesce(usado_em, now()) where id = p_id and lower(email) = em and criado_em > now() - interval '1 hour';
  return query select s.imovel, s.retorno from sso_prefill s where s.id = p_id and lower(s.email) = em and s.criado_em > now() - interval '1 hour';
end $$;
revoke all on function aval_prefill_pegar(uuid) from public, anon;
grant execute on function aval_prefill_pegar(uuid) to authenticated;

-- 2) Mesmo avaliacao_id para o site quando o corretor refaz a avaliação do mesmo imóvel
create table if not exists sso_avaliacao_ref (
  email text not null, ref text not null, avaliacao_id uuid not null, atualizado_em timestamptz not null default now(),
  primary key (email, ref));
alter table sso_avaliacao_ref enable row level security;
revoke all on sso_avaliacao_ref from anon, authenticated;

-- 3) PDFs dos dossiês: bucket privado, só PDF, até 25 MB; cada corretor só mexe na pasta do próprio e-mail
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dossies', 'dossies', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 26214400, allowed_mime_types = array['application/pdf'];
drop policy if exists dossies_ler on storage.objects;
drop policy if exists dossies_enviar on storage.objects;
drop policy if exists dossies_trocar on storage.objects;
create policy dossies_ler on storage.objects for select to authenticated
  using (bucket_id = 'dossies' and split_part(name, '/', 1) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy dossies_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'dossies' and split_part(name, '/', 1) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy dossies_trocar on storage.objects for update to authenticated
  using (bucket_id = 'dossies' and split_part(name, '/', 1) = lower(coalesce(auth.jwt() ->> 'email', '')));

commit;

select 'ok — avaliar imóvel pelo site: sso_prefill, sso_avaliacao_ref e bucket dossies' as status;
