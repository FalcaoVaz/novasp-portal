#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
carregar_guess.py — Acervo Guess (frente 11 do piloto) → tabelas guess_* no Supabase.

Lê os 4 exports prioritários do Guess (NexusDB) que o Fabio gerou em xlsx e carrega
em tabelas só-leitura do portal:

    ContratosLoc.xlsx  → guess_contratos   (contratos de locação, ativos e encerrados)
    Cadmovel.xlsx      → guess_imoveis     (ficha do imóvel; ContratosLoc.Imovel → Cadmovel.Contrato)
    Clientes.xlsx      → guess_clientes    (proprietários/clientes)
    Inquilinos.xlsx    → guess_inquilinos  (inquilinos)

Uso:
    python3 carregar_guess.py --gerar-sql > ../portal/sql/2026-09-29-acervo-guess.sql
    python3 carregar_guess.py --pasta ~/Downloads --dry-run                # só lê, mascara e mostra estatísticas
    python3 carregar_guess.py --pasta ~/Downloads                          # SANDBOX (DSN ~/.config/novasp/sandbox.dsn), SEMPRE mascarado
    python3 carregar_guess.py --pasta ~/Downloads --dsn ~/.config/novasp/prod-pooler.dsn --producao   # só o Rodrigo; sem máscara

Regras:
  • O schema (tabelas, índices, RLS, views) sai de --gerar-sql a partir do mesmo mapa de
    colunas usado na carga: uma fonte só, sem divergir.
  • Colunas "core" viram colunas tipadas; o resto das colunas NÃO vazias do export vai
    para `extra jsonb` (nada se perde; nada precisa ser rediscutido depois).
  • SANDBOX = compartilhado pelos 8 do piloto → carga SEMPRE mascarada (regra do
    formulário, 21/09): nome vira "PESSOA 00001", CPF/CNPJ mantém só a pontuação,
    telefone/e-mail mascarados, endereço mantém o tipo e o bairro e perde rua/número,
    campos de texto livre somem, `extra` das pessoas some. Valores, datas e IDs ficam.
  • PRODUÇÃO (ref mqcduyvpuxdweqesgwrq) só com --producao explícito e sem máscara; o
    script recusa a máscara em produção e recusa produção sem a flag.
  • Carga é idempotente: TRUNCATE das 4 tabelas + INSERT; registra em guess_cargas.
"""
import argparse, datetime, decimal, json, os, re, sys, unicodedata

PROD_REF = 'mqcduyvpuxdweqesgwrq'

# ─────────────────────────────────────────────────────────────────────
# Mapa de colunas: (coluna no xlsx, coluna no Postgres, tipo)
# tipos: int | num | date | time | text
# ─────────────────────────────────────────────────────────────────────
CONTRATOS = [
    ('Contrato','contrato','int'), ('Imovel','imovel','int'), ('Proprietario','proprietario','int'),
    ('Inquilino','inquilino','int'), ('Inquilino2','inquilino2','int'), ('Inquilino3','inquilino3','int'),
    ('Fiador','fiador','int'), ('Fiador2','fiador2','int'), ('Fiador3','fiador3','int'), ('Fiador4','fiador4','int'),
    ('DataContrato','data_contrato','date'), ('PrimVencto','prim_vencto','date'), ('DiaVencto','dia_vencto','int'),
    ('PeriodoContrato','periodo_contrato','int'), ('ValContrato','val_contrato','num'),
    ('AdminstracaoPer','administracao_per','num'), ('AdministracaoVal','administracao_val','num'),
    ('IntermediacaoPer','intermediacao_per','num'), ('IntermediacaoVal','intermediacao_val','num'),
    ('Vigenciade','vigencia_de','date'), ('Vigenciaate','vigencia_ate','date'),
    ('Reajuste','reajuste','text'), ('TipoIndice','tipo_indice','int'),
    ('Situacao','situacao','text'), ('SituacaoJ','situacao_j','text'),
    ('TipoContrato','tipo_contrato','int'), ('TipoModContrato','tipo_mod_contrato','text'),
    ('TipoFianca','tipo_fianca','text'), ('Garantido','garantido','text'), ('SeguroFianca','seguro_fianca','text'),
    ('CodSeguradora','cod_seguradora','int'), ('ValorCaucao','valor_caucao','num'),
    ('Datarescisao','data_rescisao','date'), ('UsuarioRescisao','usuario_rescisao','text'), ('HoraRescisao','hora_rescisao','time'),
    ('ProxReajuste','prox_reajuste','date'), ('ProxRenovacao','prox_renovacao','date'), ('UltRenovacao','ult_renovacao','date'),
    ('Nrenovacao','n_renovacao','int'), ('Nmeses','n_meses','int'),
    ('UsuarioCriacao','usuario_criacao','text'), ('DataCriacao','data_criacao','date'), ('HoraCriacao','hora_criacao','time'),
    ('Observacao6','observacao','text'),
    ('CobEndereco','cob_endereco','text'), ('CobBairro','cob_bairro','text'), ('CobCEP','cob_cep','text'),
    ('CobCidade','cob_cidade','text'), ('CobEstado','cob_estado','text'), ('CobComplemento','cob_complemento','text'),
    ('CtrlPasta','ctrl_pasta','text'), ('Multa','multa','int'), ('Juros','juros','int'), ('MesAdm','mes_adm','int'),
    ('Carencia','carencia','int'), ('DeclaraIRRF','declara_irrf','text'),
]
IMOVEIS = [
    ('Contrato','imovel','int'),            # no Guess a "chave" do imóvel se chama Contrato; ContratosLoc.Imovel aponta pra cá
    ('Proprietario','proprietario','int'), ('Endereco','endereco','text'), ('Bairro','bairro','text'),
    ('Cidade','cidade','text'), ('Estado','estado','text'), ('Cep','cep','text'), ('Complemento','complemento','text'),
    ('Pasta','pasta','int'), ('IptuLote','iptu_lote','text'), ('Situacao','situacao','text'), ('Acerto','acerto','text'),
    ('PercPartProp','perc_part_prop','int'), ('Administracao','administracao','int'), ('ContratoRef','contrato_ref','int'),
    ('Condominio','condominio','int'), ('CodigoCidadeDimob','codigo_cidade_dimob','text'), ('TipoDeImovelDimob','tipo_imovel_dimob','text'),
    ('DaemNContrib','daem_n_contrib','text'), ('NumeroDePessoas','numero_de_pessoas','int'),
    ('NroRegistroImovel','nro_registro_imovel','text'), ('NroRegMatricImovel','nro_reg_matric_imovel','text'),
    ('GasEncanado','gas_encanado','text'), ('NCadastro','n_cadastro','text'), ('ExtratoInteiro','extrato_inteiro','text'),
    ('CompetenciaCondominio','competencia_condominio','text'), ('LuzUC','luz_uc','text'),
]
PESSOA_BASE = [
    ('Codigo','codigo','int'), ('Razao','nome','text'), ('Fantasia','fantasia','text'),
    ('TipoEndereco','tipo_endereco','text'), ('Endereco','endereco','text'), ('Numero','numero','text'), ('Complemento','complemento','text'),
    ('Bairro','bairro','text'), ('Cidade','cidade','text'), ('Estado','estado','text'), ('Cep','cep','text'),
    ('Telefone','telefone','text'), ('Fax','fax','text'), ('Email','email','text'),
    ('Cgccpf','cpf_cnpj','text'), ('Ierg','rg_ie','text'), ('Contato','contato','text'), ('Observacao','observacao','text'),
    ('Cadastro','cadastro','date'), ('Atividade','ultima_atividade','date'), ('Categoria','categoria','text'),
    ('EstCivil','estado_civil','text'), ('Profissao','profissao','text'), ('Nacionalidade','nacionalidade','text'),
    ('Situacao','situacao','text'), ('DataUltAlteracao','data_ult_alteracao','date'), ('NomeUsrAlterou','usuario_alterou','text'),
    ('Sexo','sexo','text'),
]
CLIENTES   = PESSOA_BASE + [('NomeConjuge','conjuge','text'), ('DeclaraIRRF','declara_irrf','text'),
                            ('PropEstrangeiro','prop_estrangeiro','text'), ('PropResidenteFora','prop_residente_fora','text')]
INQUILINOS = PESSOA_BASE + [('Esposa','conjuge','text'), ('RendaMensal','renda_mensal','num'), ('Selecionado','selecionado','text')]

TABELAS = [
    # (tabela pg, arquivo xlsx, mapa, pk, comentário)
    ('guess_contratos',  'ContratosLoc.xlsx', CONTRATOS,  'contrato', 'Contratos de locação do Guess (ativos e encerrados; Situacao distingue). Imovel → guess_imoveis.imovel; Proprietario → guess_clientes.codigo; Inquilino/2/3 → guess_inquilinos.codigo.'),
    ('guess_imoveis',    'Cadmovel.xlsx',     IMOVEIS,    'imovel',   'Ficha do imóvel (CadIMovel). No Guess a chave se chama "Contrato"; aqui é imovel.'),
    ('guess_clientes',   'Clientes.xlsx',     CLIENTES,   'codigo',   'Proprietários/clientes (Clientes).'),
    ('guess_inquilinos', 'Inquilinos.xlsx',   INQUILINOS, 'codigo',   'Inquilinos (maior cadastro de pessoas do Guess).'),
]
PG_TIPO = {'int':'integer', 'num':'numeric(14,2)', 'date':'date', 'time':'time', 'text':'text'}

# ─────────────────────────────────────────────────────────────────────
# Máscara (sandbox)
# ─────────────────────────────────────────────────────────────────────
def _digitos_para_asterisco(s): return re.sub(r'\d', '*', s) if s else s
def _mask_email(s): return 'mascarado@exemplo.invalid' if s else s
_TIPOS_LOGRADOURO = r'^(RUA|R|AVENIDA|AV|ALAMEDA|AL|TRAVESSA|TRAV|TV|PRACA|PRAÇA|PC|PCA|ESTRADA|EST|RODOVIA|ROD|LARGO|LG|VIELA|VL|VIA|PARQUE|PQ|JARDIM|JD)\b\.?'
def _mask_endereco(s):
    # mantém só o TIPO do logradouro (regra do formulário); "AV.JABAQUARA" → "AV MASCARADA"
    if not s: return s
    m = re.match(_TIPOS_LOGRADOURO, s.strip().upper())
    return f"{m.group(1) if m else 'LOGRADOURO'} MASCARADA"
def _mask_alnum(s): return re.sub(r'[A-Za-z0-9]', '*', s) if s else s
def _mask_cep(s):
    if not s: return s
    d = re.sub(r'\D', '', s)
    return (d[:3] + '**-***') if len(d) >= 3 else '*****-***'
def _null(_): return None

MASCARA_PESSOA = {
    'nome': None,  # tratado à parte (usa o código)
    'fantasia': _null, 'endereco': _mask_endereco, 'numero': _null, 'complemento': _null, 'cep': _mask_cep,
    'telefone': _digitos_para_asterisco, 'fax': _digitos_para_asterisco, 'email': _mask_email,
    'cpf_cnpj': _digitos_para_asterisco, 'rg_ie': _mask_alnum, 'contato': _digitos_para_asterisco,
    'observacao': _null, 'conjuge': _null,
}
MASCARA_IMOVEL = {
    'endereco': _mask_endereco, 'complemento': _null, 'cep': _mask_cep,
    'daem_n_contrib': _digitos_para_asterisco, 'nro_registro_imovel': _null, 'nro_reg_matric_imovel': _null,
    'gas_encanado': _digitos_para_asterisco, 'n_cadastro': _digitos_para_asterisco, 'luz_uc': _digitos_para_asterisco,
}
MASCARA_CONTRATO = {
    'cob_endereco': _mask_endereco, 'cob_complemento': _null, 'cob_cep': _mask_cep, 'observacao': _null,
}
def _mascarar_extra_contrato(extra):
    # mantém só números/datas e códigos curtos; texto livre some
    return {k: v for k, v in extra.items() if not isinstance(v, str) or len(v) <= 3}

def aplicar_mascara(tabela, row, extra):
    if tabela in ('guess_clientes', 'guess_inquilinos'):
        row['nome'] = f"PESSOA {row['codigo']:05d}"
        for k, fn in MASCARA_PESSOA.items():
            if fn and k in row: row[k] = fn(row[k])
        return row, None                      # extra das pessoas NÃO vai pro sandbox
    if tabela == 'guess_imoveis':
        for k, fn in MASCARA_IMOVEL.items():
            if k in row: row[k] = fn(row[k])
        return row, _mascarar_extra_contrato(extra)
    if tabela == 'guess_contratos':
        for k, fn in MASCARA_CONTRATO.items():
            if k in row: row[k] = fn(row[k])
        return row, _mascarar_extra_contrato(extra)
    return row, extra

# ─────────────────────────────────────────────────────────────────────
# Leitura / conversão
# ─────────────────────────────────────────────────────────────────────
def _limpa(v):
    if v is None: return None
    if isinstance(v, str):
        v = v.strip()
        return v if v != '' else None
    return v

def _conv(v, tipo):
    v = _limpa(v)
    if v is None: return None
    if tipo == 'int':
        if isinstance(v, (int, float)): return int(v)
        d = re.sub(r'[^\d-]', '', str(v)); return int(d) if d not in ('', '-') else None
    if tipo == 'num':
        if isinstance(v, (int, float, decimal.Decimal)): return round(float(v), 2)
        s = str(v).replace('.', '').replace(',', '.');
        try: return round(float(s), 2)
        except ValueError: return None
    if tipo == 'date':
        if isinstance(v, datetime.datetime): v = v.date()
        if isinstance(v, datetime.date):
            return v if 1900 <= v.year <= 2100 else None    # o export tem lixo tipo 0202-01-22
        return None
    if tipo == 'time':
        if isinstance(v, datetime.datetime): return v.time()
        return v if isinstance(v, datetime.time) else None
    return str(v)

def _json_safe(v):
    if isinstance(v, (datetime.datetime, datetime.date, datetime.time)): return v.isoformat()
    if isinstance(v, decimal.Decimal): return float(v)
    return v

def ler_tabela(pasta, tabela, arquivo, mapa, pk, mascarar):
    import openpyxl
    caminho = os.path.join(pasta, arquivo)
    wb = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    it = ws.iter_rows(values_only=True)
    cab = [str(c).strip() if c is not None else '' for c in next(it)]
    idx = {c: i for i, c in enumerate(cab)}
    faltando = [x for x, _, _ in mapa if x not in idx]
    if faltando: raise SystemExit(f'{arquivo}: colunas esperadas ausentes: {faltando}')
    core_xlsx = {x for x, _, _ in mapa}
    linhas, pulados, dup = [], 0, 0
    vistos = set()
    for r in it:
        if r is None or all(_limpa(v) is None for v in r): continue
        row = {pg: _conv(r[idx[x]], t) for x, pg, t in mapa}
        if row[pk] is None: pulados += 1; continue
        if row[pk] in vistos: dup += 1; continue
        vistos.add(row[pk])
        extra = {}
        for c, i in idx.items():
            if c and c not in core_xlsx and i < len(r):
                v = _limpa(r[i])
                if v is not None: extra[c] = _json_safe(v)
        if mascarar: row, extra = aplicar_mascara(tabela, row, extra)
        row['extra'] = extra
        linhas.append(row)
    return linhas, pulados, dup

# ─────────────────────────────────────────────────────────────────────
# SQL (gerado a partir do mapa)
# ─────────────────────────────────────────────────────────────────────
def gerar_sql():
    out = []
    w = out.append
    w("-- ═══════════════════════════════════════════════════════════════")
    w("-- ACERVO GUESS (frente 11 do piloto) — tabelas só-leitura do backup do Guess")
    w("-- GERADO por sandbox/carregar_guess.py --gerar-sql (não editar à mão; mude o mapa lá).")
    w(f"-- Gerado em {datetime.date.today().isoformat()}.")
    w("--")
    w("-- • 4 tabelas prioritárias (ContratosLoc, CadIMovel, Clientes, Inquilinos) com colunas")
    w("--   tipadas + `extra jsonb` com as demais colunas não vazias do export.")
    w("-- • RLS: SELECT para authenticated; nenhuma escrita pela API (carga só pelo script, via DSN).")
    w("-- • Views guess_v_* juntam contrato + imóvel + nomes (security_invoker: RLS vale nelas).")
    w("-- • Quem VÊ o módulo é gated na UI (gerentes); a retenção é decisão da Fernanda.")
    w("-- Rodar PRIMEIRO no sandbox. Produção: só o Rodrigo.")
    w("-- ═══════════════════════════════════════════════════════════════")
    w("")
    w("create extension if not exists pg_trgm;")
    w("")
    w("create table if not exists guess_cargas (")
    w("  id           bigint generated always as identity primary key,")
    w("  tabela       text not null,")
    w("  arquivo      text not null,")
    w("  linhas       integer not null,")
    w("  mascarado    boolean not null,")
    w("  carregado_em timestamptz not null default now(),")
    w("  observacao   text")
    w(");")
    w("")
    for tabela, arquivo, mapa, pk, comentario in TABELAS:
        w(f"-- {comentario}")
        w(f"create table if not exists {tabela} (")
        cols = [f"  {pg:24s} {PG_TIPO[t]}" + (" primary key" if pg == pk else "") for _, pg, t in mapa]
        cols.append(f"  {'extra':24s} jsonb")
        w(",\n".join(cols))
        w(");")
        w(f"comment on table {tabela} is '{comentario.replace(chr(39), chr(39)*2)} Origem: {arquivo}.';")
        w("")
    w("-- Índices de consulta")
    w("create index if not exists idx_gc_imovel       on guess_contratos (imovel);")
    w("create index if not exists idx_gc_proprietario on guess_contratos (proprietario);")
    w("create index if not exists idx_gc_inquilino    on guess_contratos (inquilino);")
    w("create index if not exists idx_gc_situacao     on guess_contratos (situacao);")
    w("create index if not exists idx_gc_vig_ate      on guess_contratos (vigencia_ate);")
    w("create index if not exists idx_gi_proprietario on guess_imoveis (proprietario);")
    w("create index if not exists idx_gi_endereco_trgm on guess_imoveis using gin (endereco gin_trgm_ops);")
    w("create index if not exists idx_gcl_nome_trgm    on guess_clientes using gin (nome gin_trgm_ops);")
    w("create index if not exists idx_gin_nome_trgm    on guess_inquilinos using gin (nome gin_trgm_ops);")
    w("create index if not exists idx_gcl_doc          on guess_clientes (cpf_cnpj);")
    w("create index if not exists idx_gin_doc          on guess_inquilinos (cpf_cnpj);")
    w("")
    w("-- RLS: só leitura para usuário logado; sem insert/update/delete pela API")
    for t in ['guess_cargas'] + [t for t, *_ in TABELAS]:
        w(f"alter table {t} enable row level security;")
        w(f"drop policy if exists leitura_autenticada on {t};")
        w(f"create policy leitura_autenticada on {t} for select to authenticated using (true);")
    w("")
    w("-- View de consulta: contrato + imóvel + nomes")
    w("create or replace view guess_v_contratos with (security_invoker = true) as")
    w("select c.contrato, c.situacao, c.situacao_j, c.data_contrato, c.vigencia_de, c.vigencia_ate, c.data_rescisao,")
    w("       c.val_contrato, c.tipo_contrato, c.tipo_fianca, c.periodo_contrato, c.dia_vencto,")
    w("       c.imovel, i.endereco, i.complemento, i.bairro, i.cidade, i.cep, i.situacao as situacao_imovel,")
    w("       c.proprietario, p.nome as proprietario_nome, c.inquilino, q.nome as inquilino_nome,")
    w("       c.inquilino2, q2.nome as inquilino2_nome, c.fiador, c.usuario_criacao, c.data_criacao")
    w("  from guess_contratos c")
    w("  left join guess_imoveis    i  on i.imovel  = c.imovel")
    w("  left join guess_clientes   p  on p.codigo  = c.proprietario")
    w("  left join guess_inquilinos q  on q.codigo  = c.inquilino")
    w("  left join guess_inquilinos q2 on q2.codigo = c.inquilino2;")
    w("")
    w("select 'ok — acervo guess: 4 tabelas + guess_cargas + guess_v_contratos' as status;")
    w("")
    w("-- Rollback: drop view guess_v_contratos; drop table guess_contratos, guess_imoveis, guess_clientes, guess_inquilinos, guess_cargas;")
    return "\n".join(out) + "\n"

# ─────────────────────────────────────────────────────────────────────
# Carga
# ─────────────────────────────────────────────────────────────────────
def carregar(dsn, pasta, mascarar, producao):
    import psycopg2, psycopg2.extras
    if PROD_REF in dsn and not producao:
        raise SystemExit('DSN de PRODUÇÃO detectado. Use --producao explicitamente (só o Rodrigo).')
    if producao and mascarar:
        raise SystemExit('Produção não recebe carga mascarada.')
    conn = psycopg2.connect(dsn); conn.autocommit = False
    cur = conn.cursor()
    try:
        cur.execute("truncate guess_contratos, guess_imoveis, guess_clientes, guess_inquilinos")
        for tabela, arquivo, mapa, pk, _ in TABELAS:
            linhas, pulados, dup = ler_tabela(pasta, tabela, arquivo, mapa, pk, mascarar)
            cols = [pg for _, pg, _ in mapa] + ['extra']
            sql = f"insert into {tabela} ({', '.join(cols)}) values %s"
            vals = [tuple(psycopg2.extras.Json(r[c]) if c == 'extra' and r[c] is not None else r[c] for c in cols) for r in linhas]
            psycopg2.extras.execute_values(cur, sql, vals, page_size=500)
            cur.execute("insert into guess_cargas (tabela, arquivo, linhas, mascarado, observacao) values (%s,%s,%s,%s,%s)",
                        (tabela, arquivo, len(linhas), mascarar, f'pulados sem chave: {pulados}; chaves duplicadas: {dup}'))
            print(f'  {tabela:18s} {len(linhas):6d} linhas  (sem chave: {pulados}, duplicadas: {dup})')
        conn.commit()
        print('OK — carga concluída', '(MASCARADA)' if mascarar else '(produção, sem máscara)')
    except Exception:
        conn.rollback(); raise
    finally:
        conn.close()

def dry_run(pasta, mascarar):
    total = 0
    for tabela, arquivo, mapa, pk, _ in TABELAS:
        linhas, pulados, dup = ler_tabela(pasta, tabela, arquivo, mapa, pk, mascarar)
        total += len(linhas)
        ex = sum(1 for r in linhas if r['extra'])
        kext = set(); [kext.update(r['extra'].keys()) for r in linhas if r['extra']]
        print(f'  {tabela:18s} {len(linhas):6d} linhas | sem chave {pulados} | duplicadas {dup} | com extra {ex} ({len(kext)} chaves)')
        if mascarar:
            # prova de máscara: nada de nome real, nenhum dígito em documento, nenhum e-mail real
            if tabela in ('guess_clientes', 'guess_inquilinos'):
                assert all(str(r['nome']).startswith('PESSOA ') for r in linhas), 'nome não mascarado'
                assert not any(re.search(r'\d', r['cpf_cnpj'] or '') for r in linhas), 'documento com dígito'
                assert all((r['email'] or '').endswith('.invalid') or r['email'] is None for r in linhas), 'e-mail real'
                assert all(r['extra'] is None for r in linhas), 'extra de pessoa no sandbox'
                assert all(r['numero'] is None and r['observacao'] is None and r['conjuge'] is None for r in linhas)
                assert all(r['endereco'] is None or re.fullmatch(r'[A-ZÇ]+ MASCARADA', r['endereco']) for r in linhas), 'endereço de pessoa não mascarado'
                assert not any(re.search(r'[A-Za-z0-9]', r['rg_ie'] or '') for r in linhas), 'RG com caractere'
            if tabela == 'guess_imoveis':
                assert all(r['endereco'] is None or re.fullmatch(r'[A-ZÇ]+ MASCARADA', r['endereco']) for r in linhas), 'endereço de imóvel não mascarado'
            if tabela == 'guess_contratos':
                assert all((r['cob_endereco'] or ' MASCARADA').endswith('MASCARADA') for r in linhas)
                assert all(not isinstance(v, str) or len(v) <= 3 for r in linhas for v in (r['extra'] or {}).values()), 'texto livre em extra'
            amostra = {k: v for k, v in linhas[0].items() if k != 'extra'}
            print('     amostra mascarada:', json.dumps(amostra, ensure_ascii=False, default=str)[:400])
    print(f'  total: {total} linhas — dry-run OK', '(máscara verificada)' if mascarar else '')

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--gerar-sql', action='store_true', help='imprime o DDL e sai')
    ap.add_argument('--pasta', default=os.path.expanduser('~/Downloads'), help='pasta com os 4 xlsx')
    ap.add_argument('--dsn', default=os.path.expanduser('~/.config/novasp/sandbox.dsn'), help='arquivo com o DSN')
    ap.add_argument('--dry-run', action='store_true', help='só lê e mostra estatísticas (sem banco)')
    ap.add_argument('--producao', action='store_true', help='carga em PRODUÇÃO sem máscara (só o Rodrigo)')
    a = ap.parse_args()
    if a.gerar_sql:
        sys.stdout.write(gerar_sql()); return
    mascarar = not a.producao
    if a.dry_run:
        print(f'DRY-RUN — pasta {a.pasta} — máscara: {mascarar}')
        dry_run(a.pasta, mascarar); return
    dsn = open(a.dsn).read().strip()
    print(f'Carga — pasta {a.pasta} — máscara: {mascarar} — destino: {"PRODUÇÃO" if PROD_REF in dsn else "sandbox"}')
    carregar(dsn, a.pasta, mascarar, a.producao)

if __name__ == '__main__':
    main()
