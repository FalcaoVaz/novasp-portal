-- ═══════════════════════════════════════════════════════════════
-- AGENDA NO CELULAR (Rodrigo, 23/10/2026): link pessoal de assinatura (.ics) para o calendário do iPhone/Google.
-- Cada usuário tem um token secreto; a função agenda-ics (site do jurídico) monta o calendário só com os
-- compromissos daquela pessoa (eventos em que é responsável/participante, os pessoais dela e as reuniões fixas
-- da pauta de que participa). Só leitura: o celular não grava no portal.
-- O token não sai pela API para ninguém além do dono (RPCs abaixo, com o login dele).
-- Rodar no SQL Editor do falcaovaz-juridico. Pode rodar de novo sem erro.
-- ═══════════════════════════════════════════════════════════════
begin;

create table if not exists agenda_feed (
  token       text primary key,
  usuario_id  uuid not null references usuarios(id),
  criado_em   timestamptz not null default now(),
  revogado_em timestamptz,
  ultimo_uso  timestamptz
);
create index if not exists agenda_feed_usuario on agenda_feed (usuario_id) where revogado_em is null;
alter table agenda_feed enable row level security;
revoke all on agenda_feed from anon, authenticated;     -- só pelas RPCs (e a função do Netlify, com service_role)

-- Link do usuário logado: devolve o ativo ou cria um (renovar = true troca o link e invalida o anterior)
create or replace function agenda_feed_token(renovar boolean default false) returns text
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid; v_tok text;
begin
  select u.id into v_uid from usuarios u
   where lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and coalesce(u.ativo, true) limit 1;
  if v_uid is null then raise exception 'usuário não encontrado'; end if;
  if renovar then
    update agenda_feed set revogado_em = now() where usuario_id = v_uid and revogado_em is null;
  else
    select token into v_tok from agenda_feed where usuario_id = v_uid and revogado_em is null order by criado_em desc limit 1;
    if v_tok is not null then return v_tok; end if;
  end if;
  v_tok := encode(extensions.gen_random_bytes(24), 'hex');
  insert into agenda_feed (token, usuario_id) values (v_tok, v_uid);
  return v_tok;
end $$;
revoke all on function agenda_feed_token(boolean) from public, anon;
grant execute on function agenda_feed_token(boolean) to authenticated;

commit;

select 'ok — agenda_feed' as status;
