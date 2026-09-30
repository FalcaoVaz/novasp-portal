#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
carregar_nido.py — Acervo NIDO (vendas/locação até set/2026) → tabelas nido_* no Supabase.

Lê o dump MySQL do NIDO (backup de 28/09/2026, ~1,9 GB) em streaming, sem banco intermediário,
e carrega um recorte de consulta no portal:

    exporta_imovel        → nido_imoveis      (todos os imóveis que passaram pela NSP, 129.978)
    exporta_pfj (+email, +telefone) → nido_pessoas (SÓ as pessoas referenciadas como proprietário
                                        de imóvel ou proponente — não as 539 mil)
    exporta_proposta      → nido_propostas
    exporta_fechamento    → nido_fechamentos  (negócios fechados: venda e locação)
    exporta_profissional  → nido_corretores   (sem CPF/RG/contato)

Uso:
    python3 carregar_nido.py --gerar-sql > ../portal/sql/2026-09-30-acervo-nido.sql
    python3 carregar_nido.py --dry-run                      # lê o dump, mostra contagens; nada no banco
    python3 carregar_nido.py --dsn ~/.config/novasp/prod-pooler.dsn --producao   # só o Rodrigo

Regras:
  • Mesmo mapa de colunas gera o DDL e a carga. Texto livre pesado (texto_interno/externo,
    documentação, condições de pagamento) fica FORA (tamanho do Free e dado sensível).
  • Telefones/e-mails das pessoas entram na tabela mas NÃO são liberados pela API
    (grant por coluna) até a regra de retenção/acesso da Fernanda — igual ao Guess.
  • Acesso pela API = mesma lista do Guess (guess_acesso + admins, função acervo_pode_ler()).
  • Duas passadas no dump: 1ª imóveis/propostas/fechamentos/corretores (guarda as chaves de
    pessoa usadas); 2ª pessoas + e-mails + telefones filtrados por essas chaves.
  • Carga idempotente: TRUNCATE + INSERT; registra em nido_cargas.
"""
import argparse, datetime, os, re, sys, time

PROD_REF = 'mqcduyvpuxdweqesgwrq'
DUMP_PADRAO = os.path.expanduser('~/Downloads/nido-backup/exportacao/108/backup_2026-09-28.sql')

# tipos: int | num | date | dt (datetime→date) | text | flag (S/N/'' → text)
IMOVEIS = [
    ('chave_imovel','chave_imovel','text'), ('codigo_anterior','codigo_anterior','text'), ('tipo_imovel','tipo_imovel','text'),
    ('classificacao','classificacao','text'), ('origem','origem','text'), ('situacao','situacao','text'), ('situacao_detalhe','situacao_detalhe','text'),
    ('data_cadastro','data_cadastro','dt'), ('data_atualizacao','data_atualizacao','dt'), ('data_ativo','data_ativo','dt'), ('locado_ate','locado_ate','date'),
    ('cep','cep','text'), ('cidade','cidade','text'), ('estado','estado','text'), ('bairro','bairro','text'), ('regiao','regiao','text'),
    ('logradouro','logradouro','text'), ('endereco','endereco','text'), ('numero','numero','int'), ('unidade','unidade','text'), ('andar','andar','int'),
    ('bloco','bloco','text'), ('complemento','complemento','text'), ('zoneamento','zoneamento','text'), ('latitude','latitude','num6'), ('longitude','longitude','num6'),
    ('edificio','edificio','text'), ('condominio','condominio','text'), ('construtora','construtora','text'), ('ano_construcao','ano_construcao','int'),
    ('area_total_terreno','area_total_terreno','num'), ('area_util_construida','area_util_construida','num'),
    ('dormitorio','dormitorio','int'), ('suite','suite','int'), ('vaga','vaga','int'), ('banheiro','banheiro','int'), ('sala','sala','int'),
    ('disponivel_venda','disponivel_venda','flag'), ('valor_venda','valor_venda','num'), ('disponivel_locacao','disponivel_locacao','flag'), ('valor_locacao','valor_locacao','num'),
    ('valor_condominio','valor_condominio','num'), ('valor_iptu','valor_iptu','num'), ('exclusividade','exclusividade','flag'), ('placa','placa','flag'),
    ('chave_pessoa_fj','chave_pessoa_fj','text'), ('contribuinte','contribuinte','text'), ('matricula','matricula','text'), ('registro','registro','text'),
]
PESSOAS = [
    ('chave_pessoa_fj','chave_pessoa_fj','text'), ('nome','nome','text'), ('proprietario','proprietario','flag'), ('cliente','cliente','flag'),
    ('cpf_cnpj','cpf_cnpj','text'), ('cep','cep','text'), ('endereco','endereco','text'), ('numero','numero','int'), ('complemento','complemento','text'),
    ('bairro','bairro','text'), ('cidade','cidade','text'), ('estado','estado','text'), ('profissao','profissao','text'), ('situacao','situacao','text'),
]
PROPOSTAS = [
    ('chave_proposta','chave_proposta','text'), ('chave_imovel','chave_imovel','text'), ('chave_pfj','chave_pessoa_fj','text'), ('chave_fac','chave_fac','text'),
    ('data_cadastro','data_cadastro','dt'), ('tipo_proposta','tipo_proposta','text'), ('codigo_tipo_negocio','tipo_negocio','text'),
    ('valor_proposta','valor_proposta','num'), ('valor_atual_proposta','valor_atual_proposta','num'), ('porcentagem_comissao','porcentagem_comissao','num'),
    ('valor_comissao','valor_comissao','num'), ('situacao','situacao','text'), ('detalhe_situacao','detalhe_situacao','text'),
    ('data_encerramento','data_encerramento','date'), ('motivo_recusa','motivo_recusa','text'), ('status_financiamento','status_financiamento','text'),
]
FECHAMENTOS = [
    ('chave_fechamento','chave_fechamento','text'), ('chave_imovel','chave_imovel','text'), ('chave_proposta','chave_proposta','text'),
    ('datacadastro','data_cadastro','dt'), ('datafechamento','data_fechamento','date'), ('negocio','negocio','text'),
    ('valor_fechamento','valor_fechamento','num'), ('valor_faturamento','valor_faturamento','num'), ('valor_comissao','valor_comissao','num'),
    ('parcelas','parcelas','int'), ('obs','obs','text'), ('situacao','situacao','text'), ('mes_referencia','mes_referencia','text'),
    ('situacao_posvenda','situacao_posvenda','text'), ('parceria','parceria','text'),
]
CORRETORES = [
    ('chave_profissional','chave_profissional','text'), ('nome','nome','text'), ('nomeuso','nome_uso','text'), ('equipe','equipe','text'),
    ('tipo_equipe','tipo_equipe','text'), ('chave_agencia','chave_agencia','text'), ('situacao','situacao','text'),
    ('admissao','admissao','date'), ('demissao','demissao','date'), ('creci','creci','text'),
]
TABELAS = [
    ('nido_imoveis',     'exporta_imovel',       IMOVEIS,     'chave_imovel',      'Imóveis que passaram pela NSP (NIDO, 2000–2026). chave_pessoa_fj → nido_pessoas.'),
    ('nido_pessoas',     'exporta_pfj',          PESSOAS,     'chave_pessoa_fj',   'Pessoas referenciadas como proprietário ou proponente (recorte do exporta_pfj). telefones/emails só via SQL (sem grant).'),
    ('nido_propostas',   'exporta_proposta',     PROPOSTAS,   'chave_proposta',    'Propostas (NIDO). chave_imovel → nido_imoveis; chave_pessoa_fj → nido_pessoas.'),
    ('nido_fechamentos', 'exporta_fechamento',   FECHAMENTOS, 'chave_fechamento',  'Negócios fechados (venda/locação). chave_imovel → nido_imoveis; chave_proposta → nido_propostas.'),
    ('nido_corretores',  'exporta_profissional', CORRETORES,  'chave_profissional','Corretores/profissionais do NIDO (sem CPF/RG/contato).'),
]
PG_TIPO = {'int':'integer','num':'numeric(14,2)','num6':'numeric(10,6)','date':'date','dt':'date','text':'text','flag':'text'}

# ─────────────────────────────────────────────────────────────────────
# Parser do dump (mesma técnica do analises/extrai_nido_backup.py do Foca)
# ─────────────────────────────────────────────────────────────────────
TOKEN = re.compile(r"'((?:[^'\\]|\\.)*)'|(NULL)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([()])")
ESC = re.compile(r"\\(.)")
_MAPA_ESC = {'n': '\n', 'r': '\r', 't': '\t', '0': '\0', 'Z': '\x1a'}
def desescapa(s): return ESC.sub(lambda m: _MAPA_ESC.get(m.group(1), m.group(1)), s) if '\\' in s else s

def colunas_do_dump(dump, alvo):
    cols, atual = {}, None
    with open(dump, encoding='utf-8', errors='replace') as f:
        for linha in f:
            if linha.startswith('CREATE TABLE `'):
                atual = linha.split('`')[1]; cols[atual] = []
            elif atual and linha.startswith('  `'):
                cols[atual].append(linha.split('`')[1])
            elif atual and linha.startswith(') ENGINE'):
                atual = None
            if atual is None and alvo <= set(cols): break
    faltam = alvo - set(cols)
    if faltam: raise SystemExit(f'tabelas não encontradas no dump: {sorted(faltam)}')
    return cols

def linhas_insert(texto):
    corpo = texto[texto.index('VALUES') + 6:]; linha = None
    for m in TOKEN.finditer(corpo):
        s, nulo, num, par = m.groups()
        if par == '(': linha = []
        elif par == ')': yield linha; linha = None
        elif linha is None: continue
        elif nulo: linha.append(None)
        elif num is not None: linha.append(num)
        else: linha.append(desescapa(s))

def varrer(dump, tabelas, cb):
    """Chama cb(tabela, valores) para cada linha INSERT das tabelas pedidas."""
    prefixos = {f'INSERT INTO `{t}` ': t for t in tabelas}
    with open(dump, encoding='utf-8', errors='replace') as f:
        for linha in f:
            if not linha.startswith('INSERT INTO `'): continue
            tab = prefixos.get(linha[:linha.index('`', 13) + 2])
            if not tab: continue
            for vals in linhas_insert(linha): cb(tab, vals)

# ─────────────────────────────────────────────────────────────────────
# Conversão
# ─────────────────────────────────────────────────────────────────────
def conv(v, tipo):
    if v is None: return None
    if isinstance(v, str):
        v = v.strip()
        if v == '' : return None
    if tipo == 'int':
        try: return int(float(v))
        except ValueError: return None
    if tipo in ('num', 'num6'):
        try: f = float(v)
        except ValueError: return None
        if tipo == 'num6': return round(f, 6) if abs(f) <= 180 else None        # lat/long com lixo (ex.: 2e125)
        return round(f, 2) if abs(f) < 1e11 else None                            # valores acima de R$ 100 bi = lixo (11111111111100)
    if tipo in ('date', 'dt'):
        s = str(v)[:10]
        if s.startswith('0000') or len(s) < 10: return None
        try: return datetime.date(int(s[0:4]), int(s[5:7]), int(s[8:10]))
        except ValueError: return None
    return str(v)

def montar(mapa, idx, vals):
    return {dst: conv(vals[idx[src]], t) for src, dst, t in mapa}

# ─────────────────────────────────────────────────────────────────────
# Leitura completa (duas passadas)
# ─────────────────────────────────────────────────────────────────────
def ler_dump(dump, log=print):
    t0 = time.time()
    alvo = {a for _, a, *_ in TABELAS} | {'exporta_pfj_email', 'exporta_pfj_telefone'}
    cols = colunas_do_dump(dump, alvo)
    idx = {t: {c: i for i, c in enumerate(cs)} for t, cs in cols.items()}
    for tabela, arq, mapa, pk, _ in TABELAS:
        faltam = [s for s, _, _ in mapa if s not in idx[arq]]
        if faltam: raise SystemExit(f'{arq}: colunas ausentes {faltam}')
    dados = {t: [] for t, *_ in TABELAS}
    vistos = {t: set() for t, *_ in TABELAS}
    dup = {t: 0 for t, *_ in TABELAS}
    chaves_pessoa = set()
    # 1ª passada
    p1 = {arq: (tabela, mapa, pk) for tabela, arq, mapa, pk, _ in TABELAS if arq != 'exporta_pfj'}
    def cb1(arq, vals):
        tabela, mapa, pk = p1[arq]
        r = montar(mapa, idx[arq], vals)
        if r[pk] is None: return
        if r[pk] in vistos[tabela]: dup[tabela] += 1; return    # exporta_imovel repete 2.291 linhas inteiras
        vistos[tabela].add(r[pk]); dados[tabela].append(r)
        if tabela == 'nido_imoveis' and r['chave_pessoa_fj']: chaves_pessoa.add(r['chave_pessoa_fj'])
        if tabela == 'nido_propostas' and r['chave_pessoa_fj']: chaves_pessoa.add(r['chave_pessoa_fj'])
    varrer(dump, set(p1), cb1)
    log(f'  1ª passada: ' + ', '.join(f'{t} {len(v)}' for t, v in dados.items() if t != 'nido_pessoas') + f' | pessoas referenciadas: {len(chaves_pessoa)} | {time.time()-t0:.0f}s')
    # 2ª passada: pessoas filtradas + contatos
    ip, ie, it = idx['exporta_pfj'], idx['exporta_pfj_email'], idx['exporta_pfj_telefone']
    tel, mail = {}, {}
    def cb2(arq, vals):
        if arq == 'exporta_pfj':
            k = vals[ip['chave_pessoa_fj']]
            if k in chaves_pessoa and k not in vistos['nido_pessoas']:
                vistos['nido_pessoas'].add(k); dados['nido_pessoas'].append(montar(PESSOAS, ip, vals))
        elif arq == 'exporta_pfj_telefone':
            k = vals[it['chave_pessoa_fj']]
            if k in chaves_pessoa:
                n = ' '.join(x for x in [conv(vals[it['ddd']], 'text'), conv(vals[it['telefone']], 'text')] if x)
                if n: tel.setdefault(k, []).append(n + ((' (' + vals[it['descricao']].strip() + ')') if vals[it['descricao']] and vals[it['descricao']].strip() else ''))
        else:
            k = vals[ie['chave_pessoa_fj']]
            if k in chaves_pessoa:
                e = conv(vals[ie['email']], 'text')
                if e: mail.setdefault(k, []).append(e)
    varrer(dump, {'exporta_pfj', 'exporta_pfj_email', 'exporta_pfj_telefone'}, cb2)
    for r in dados['nido_pessoas']:
        r['telefones'] = sorted(set(tel.get(r['chave_pessoa_fj'], [])))[:10] or None
        r['emails'] = sorted(set(e.lower() for e in mail.get(r['chave_pessoa_fj'], [])))[:10] or None
    log(f'  2ª passada: pessoas {len(dados["nido_pessoas"])} (com telefone {sum(1 for r in dados["nido_pessoas"] if r["telefones"])}, com e-mail {sum(1 for r in dados["nido_pessoas"] if r["emails"])}) | {time.time()-t0:.0f}s')
    return dados, dup

# ─────────────────────────────────────────────────────────────────────
# SQL gerado
# ─────────────────────────────────────────────────────────────────────
GRANTS = {
    'nido_imoveis':     None,   # None = todas as colunas do mapa
    'nido_pessoas':     ['chave_pessoa_fj','nome','proprietario','cliente','cpf_cnpj','bairro','cidade','estado','profissao','situacao'],  # sem endereço/telefones/emails
    'nido_propostas':   None,
    'nido_fechamentos': None,
    'nido_corretores':  None,
}
def gerar_sql():
    o = []; w = o.append
    w("-- ═══════════════════════════════════════════════════════════════")
    w("-- ACERVO NIDO — tabelas só-leitura do backup do NIDO (28/09/2026)")
    w("-- GERADO por sandbox/carregar_nido.py --gerar-sql (não editar à mão; mude o mapa lá).")
    w(f"-- Gerado em {datetime.date.today().isoformat()}. Acesso = mesma regra do Guess (acervo_pode_ler(), guess_acesso).")
    w("-- Telefones/e-mails/endereço das pessoas ficam sem grant (só via SQL) até a regra da Fernanda.")
    w("-- ═══════════════════════════════════════════════════════════════")
    w(""); w("create extension if not exists pg_trgm;"); w("")
    w("create table if not exists nido_cargas (")
    w("  id bigint generated always as identity primary key, tabela text not null, arquivo text not null,")
    w("  linhas integer not null, carregado_em timestamptz not null default now(), observacao text")
    w(");"); w("")
    for tabela, arq, mapa, pk, com in TABELAS:
        w(f"-- {com}")
        w(f"create table if not exists {tabela} (")
        cols = [f"  {dst:24s} {PG_TIPO[t]}" + (" primary key" if dst == pk else "") for _, dst, t in mapa]
        if tabela == 'nido_pessoas': cols += ["  telefones                text[]", "  emails                   text[]"]
        w(",\n".join(cols)); w(");")
        w(f"comment on table {tabela} is '{com.replace(chr(39), chr(39)*2)} Origem: {arq}.';"); w("")
    w("-- Índices")
    w("create index if not exists idx_ni_endereco_trgm on nido_imoveis using gin (endereco gin_trgm_ops);")
    w("create index if not exists idx_ni_edificio_trgm on nido_imoveis using gin (edificio gin_trgm_ops);")
    w("create index if not exists idx_ni_pessoa on nido_imoveis (chave_pessoa_fj);")
    w("create index if not exists idx_ni_cep on nido_imoveis (cep);")
    w("create index if not exists idx_ni_bairro on nido_imoveis (bairro);")
    w("create index if not exists idx_np_nome_trgm on nido_pessoas using gin (nome gin_trgm_ops);")
    w("create index if not exists idx_np_doc on nido_pessoas (cpf_cnpj);")
    w("create index if not exists idx_npr_imovel on nido_propostas (chave_imovel);")
    w("create index if not exists idx_npr_pessoa on nido_propostas (chave_pessoa_fj);")
    w("create index if not exists idx_nf_imovel on nido_fechamentos (chave_imovel);")
    w("create index if not exists idx_nf_proposta on nido_fechamentos (chave_proposta);")
    w("")
    w("-- RLS: linha só para quem pode ler o acervo (guess_acesso + admins); nenhuma escrita")
    for t in ['nido_cargas'] + [t for t, *_ in TABELAS]:
        w(f"alter table {t} enable row level security;")
        w(f"drop policy if exists acervo_gerentes on {t};")
        if t == 'nido_cargas':
            w(f"create policy acervo_gerentes on {t} for select to authenticated using (true);")
        else:
            w(f"create policy acervo_gerentes on {t} for select to authenticated using (acervo_pode_ler());")
    w("")
    w("-- Colunas liberadas uma a uma")
    w("revoke all on " + ", ".join(['nido_cargas'] + [t for t, *_ in TABELAS]) + " from anon, authenticated;")
    w("grant select on nido_cargas to authenticated;")
    for tabela, arq, mapa, pk, _ in TABELAS:
        cols = GRANTS[tabela] or [dst for _, dst, _ in mapa]
        w(f"grant select ({', '.join(cols)}) on {tabela} to authenticated;")
    w("")
    w("-- View de busca: imóvel + nome do proprietário")
    w("drop view if exists nido_v_imoveis;")
    w("create view nido_v_imoveis with (security_invoker = true) as")
    w("select i.chave_imovel, i.tipo_imovel, i.situacao, i.situacao_detalhe, i.data_cadastro, i.data_atualizacao,")
    w("       i.cep, i.bairro, i.logradouro, i.endereco, i.numero, i.unidade, i.andar, i.complemento, i.edificio, i.condominio,")
    w("       i.area_util_construida, i.dormitorio, i.suite, i.vaga, i.disponivel_venda, i.valor_venda, i.disponivel_locacao, i.valor_locacao,")
    w("       i.chave_pessoa_fj, p.nome as proprietario_nome")
    w("  from nido_imoveis i left join nido_pessoas p on p.chave_pessoa_fj = i.chave_pessoa_fj;")
    w("revoke all on nido_v_imoveis from anon, authenticated;")
    w("grant select on nido_v_imoveis to authenticated;")
    w("")
    w("select 'ok — acervo nido: 5 tabelas + nido_cargas + nido_v_imoveis' as status;")
    w("-- Rollback: drop view nido_v_imoveis; drop table nido_imoveis, nido_pessoas, nido_propostas, nido_fechamentos, nido_corretores, nido_cargas;")
    return "\n".join(o) + "\n"

# ─────────────────────────────────────────────────────────────────────
# Carga
# ─────────────────────────────────────────────────────────────────────
def carregar(dsn, dump, producao):
    import psycopg2, psycopg2.extras
    if PROD_REF in dsn and not producao:
        raise SystemExit('DSN de PRODUÇÃO detectado. Use --producao explicitamente (só o Rodrigo).')
    dados, dup = ler_dump(dump)
    # keepalives: a carga leva minutos pelo pooler; sem isso a conexão pode "morrer em silêncio"
    # e o cliente fica esperando uma resposta que não vem (sessão "idle in transaction" no servidor).
    conn = psycopg2.connect(dsn, keepalives=1, keepalives_idle=20, keepalives_interval=10, keepalives_count=3)
    conn.autocommit = False; cur = conn.cursor()
    cur.execute("set statement_timeout = '600s'")
    try:
        # uma transação POR TABELA: se cair no meio, o que já entrou fica e a próxima rodada
        # recarrega só o que faltou (TRUNCATE por tabela).
        for tabela, arq, mapa, pk, _ in TABELAS:
            cols = [dst for _, dst, _ in mapa] + (['telefones', 'emails'] if tabela == 'nido_pessoas' else [])
            sql = f"insert into {tabela} ({', '.join(cols)}) values %s"
            vals = [tuple(r.get(c) for c in cols) for r in dados[tabela]]
            t0 = time.time()
            cur.execute(f"truncate {tabela}")
            cur.execute("delete from nido_cargas where tabela = %s", (tabela,))
            for i in range(0, len(vals), 2000):
                psycopg2.extras.execute_values(cur, sql, vals[i:i+2000], page_size=500)
                print(f'\r  {tabela:18s} {min(i+2000, len(vals)):7d}/{len(vals)}', end='', flush=True)
            cur.execute("insert into nido_cargas (tabela, arquivo, linhas, observacao) values (%s,%s,%s,%s)",
                        (tabela, os.path.basename(dump), len(vals), f'duplicadas ignoradas: {dup[tabela]}'))
            conn.commit()
            print(f'\r  {tabela:18s} {len(vals):7d} linhas gravadas em {time.time()-t0:.0f}s (duplicadas: {dup[tabela]})')
        print('OK — carga concluída (produção)')
    except Exception:
        conn.rollback(); raise
    finally:
        conn.close()

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--gerar-sql', action='store_true'); ap.add_argument('--dump', default=DUMP_PADRAO)
    ap.add_argument('--dsn', default=os.path.expanduser('~/.config/novasp/prod-pooler.dsn'))
    ap.add_argument('--dry-run', action='store_true'); ap.add_argument('--producao', action='store_true')
    a = ap.parse_args()
    if a.gerar_sql: sys.stdout.write(gerar_sql()); return
    if a.dry_run:
        print(f'DRY-RUN — dump {a.dump}')
        dados, dup = ler_dump(a.dump)
        import json
        for t, rows in dados.items():
            b = sum(len(json.dumps(r, default=str, ensure_ascii=False)) for r in rows[:2000]) * (len(rows) / max(1, min(2000, len(rows))))
            print(f'  {t:18s} {len(rows):7d} linhas (dup {dup[t]}) ~{b/1e6:.1f} MB em JSON')
        return
    dsn = open(a.dsn).read().strip()
    print(f'Carga — dump {a.dump} — destino: {"PRODUÇÃO" if PROD_REF in dsn else "outro"}')
    carregar(dsn, a.dump, a.producao)

if __name__ == '__main__':
    main()
