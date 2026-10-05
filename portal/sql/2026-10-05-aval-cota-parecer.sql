-- ═══════════════════════════════════════════════════════════════
-- COTA MENSAL DE PARECER EM TEXTO por corretor (Rodrigo, 05/10/2026): conta só o parecer escrito pela IA (custa
-- ~US$ 0,18 cada); padrão 10 por mês; ao atingir, bloqueia e o gestor libera mais na tela "Cotas de parecer".
-- O uso fica numa tabela própria que ninguém grava direto (a fila ia_jobs é editável por qualquer logado):
-- só as funções abaixo, com o e-mail do LOGIN (auth.jwt), registram ou estornam. Administradores não têm limite.
-- Mês no fuso de São Paulo.
-- ═══════════════════════════════════════════════════════════════
create table if not exists aval_parecer_uso (
  id bigserial primary key, email text not null, job_id text, criado_em timestamptz not null default now());
create index if not exists aval_parecer_uso_email_ix on aval_parecer_uso (email, criado_em);
alter table aval_parecer_uso enable row level security;
revoke all on aval_parecer_uso from anon, authenticated;

create table if not exists aval_cota (
  email text primary key, limite integer not null check (limite between 0 and 500),
  atualizado_por text, atualizado_em timestamptz not null default now());
alter table aval_cota enable row level security;
revoke all on aval_cota from anon, authenticated;

create or replace function aval_cota_inicio_mes() returns timestamptz language sql stable as $$
  select (date_trunc('month', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo'
$$;
create or replace function aval_cota_eh_admin(p_email text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from usuarios u where u.admin and lower(u.email) = lower(p_email))
$$;

-- quanto o usuário logado já usou no mês
create or replace function aval_cota_parecer()
returns table(usados integer, limite integer, sem_limite boolean, mes text)
language sql stable security definer set search_path = public as $$
  with e as (select lower(coalesce(auth.jwt() ->> 'email', '')) em)
  select (select count(*) from aval_parecer_uso u, e where u.email = e.em and u.criado_em >= aval_cota_inicio_mes())::int,
         coalesce((select c.limite from aval_cota c, e where c.email = e.em), 10),
         aval_cota_eh_admin((select em from e)),
         to_char(now() at time zone 'America/Sao_Paulo', 'MM/YYYY')
$$;

-- reserva 1 parecer (a função do jurídico chama com o token do corretor ANTES de chamar a IA): confere e registra junto
create or replace function aval_cota_reservar(p_job text)
returns table(ok boolean, usados integer, limite integer)
language plpgsql security definer set search_path = public as $$
declare em text := lower(coalesce(auth.jwt() ->> 'email', '')); u integer; l integer;
begin
  if em = '' then return query select false, 0, 0; return; end if;
  perform pg_advisory_xact_lock(hashtext('aval_cota:' || em));            -- dois cliques ao mesmo tempo não furam a cota
  select count(*) into u from aval_parecer_uso where email = em and criado_em >= aval_cota_inicio_mes();
  select coalesce((select c.limite from aval_cota c where c.email = em), 10) into l;
  if u >= l and not aval_cota_eh_admin(em) then return query select false, u, l; return; end if;
  insert into aval_parecer_uso (email, job_id) values (em, p_job);
  return query select true, u + 1, l;
end $$;

-- estorna a reserva quando o parecer falhou (só do próprio usuário, só na última hora)
create or replace function aval_cota_estornar(p_job text) returns void
language sql security definer set search_path = public as $$
  delete from aval_parecer_uso where job_id = p_job and email = lower(coalesce(auth.jwt() ->> 'email', ''))
     and criado_em > now() - interval '1 hour'
$$;

-- tela do gestor (só administradores): uso do mês por usuário ativo e ajuste do limite
create or replace function aval_cota_relatorio()
returns table(email text, nome text, usados integer, limite integer, atingiu boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not aval_cota_eh_admin(coalesce(auth.jwt() ->> 'email', '')) then raise exception 'só administradores'; end if;
  return query
    select lower(u.email), u.nome,
           coalesce(x.n, 0)::int, coalesce(c.limite, 10),
           coalesce(x.n, 0) >= coalesce(c.limite, 10) and not u.admin
      from usuarios u
      left join (select p.email, count(*) n from aval_parecer_uso p where p.criado_em >= aval_cota_inicio_mes() group by 1) x on x.email = lower(u.email)
      left join aval_cota c on c.email = lower(u.email)
     where coalesce(u.ativo, true) and u.email is not null
     order by coalesce(x.n, 0) desc, u.nome;
end $$;

create or replace function aval_cota_definir(p_email text, p_limite integer) returns void
language plpgsql security definer set search_path = public as $$
declare quem text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if not aval_cota_eh_admin(quem) then raise exception 'só administradores'; end if;
  insert into aval_cota (email, limite, atualizado_por, atualizado_em) values (lower(p_email), p_limite, quem, now())
  on conflict (email) do update set limite = excluded.limite, atualizado_por = excluded.atualizado_por, atualizado_em = now();
end $$;

revoke all on function aval_cota_parecer() from public, anon;
revoke all on function aval_cota_reservar(text) from public, anon;
revoke all on function aval_cota_estornar(text) from public, anon;
revoke all on function aval_cota_relatorio() from public, anon;
revoke all on function aval_cota_definir(text, integer) from public, anon;
revoke all on function aval_cota_eh_admin(text) from public, anon;
grant execute on function aval_cota_parecer() to authenticated;
grant execute on function aval_cota_reservar(text) to authenticated;
grant execute on function aval_cota_estornar(text) to authenticated;
grant execute on function aval_cota_relatorio() to authenticated;
grant execute on function aval_cota_definir(text, integer) to authenticated;
