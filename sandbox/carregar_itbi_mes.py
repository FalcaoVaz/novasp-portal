#!/usr/bin/env python3
"""Carga incremental do ITBI no aval_itbi (portal) a partir da planilha anual da Fazenda (06/11/2026).
Lê as abas pedidas, só insere vendas que ainda não estão no banco (mesmo SQL, data, valor, complemento e matrícula,
com vazio = vazio), sem posição (o posicionador por lote/quadra põe depois) e carimba zona/distrito.
Uso: carrega_itbi_mes.py ARQUIVO.xlsx ABA [ABA...]            (simula: conta e desfaz)
     carrega_itbi_mes.py ARQUIVO.xlsx ABA [ABA...] --gravar
Depois: sandbox/posicionar_itbi_lotes.py --gravar (posição por lote/quadra + localizador de endereço) e o carimbo de zona/distrito."""
import sys, io, csv, os, datetime, openpyxl, psycopg2
ORIGEM = {'N° do Cadastro (SQL)':'sql','Nome do Logradouro':'logradouro','Número':'numero','Complemento':'complemento','CEP':'cep',
  'Natureza de Transação':'natureza','Valor de Transação (declarado pelo contribuinte)':'valor','Data de Transação':'data',
  'Valor Venal de Referência':'vvr','Proporção Transmitida (%)':'proporcao','Base de Cálculo adotada':'base_calculo',
  'Tipo de Financiamento':'financiamento','Matrícula do Imóvel':'matricula','Área do Terreno (m2)':'area_terreno','Testada (m)':'testada',
  'Fração Ideal':'fracao','Área Construída (m2)':'area_constr','Descrição do uso (IPTU)':'uso','Padrão (IPTU)':'padrao',
  'Descrição do padrão (IPTU)':'padrao_desc','ACC (IPTU)':'acc'}
COLS=['sql','logradouro','numero','complemento','cep','natureza','valor','data','vvr','proporcao','base_calculo','financiamento','matricula',
      'area_terreno','testada','fracao','area_constr','uso','padrao','padrao_desc','acc']
args=[a for a in sys.argv[1:] if not a.startswith('--')]; gravar='--gravar' in sys.argv
arq, abas = args[0], args[1:]
wb=openpyxl.load_workbook(arq, read_only=True, data_only=True)
buf=io.StringIO(); w=csv.writer(buf); n=0
def txt(v):
    if v is None: return ''
    if isinstance(v,(datetime.datetime,datetime.date)): return v.strftime('%Y-%m-%d')
    if isinstance(v,float) and v.is_integer(): return str(int(v))
    return str(v).strip()
for aba in abas:
    it=wb[aba].iter_rows(values_only=True); cab=[str(c or '').strip() for c in next(it)]
    falta=[k for k in ORIGEM if k not in cab]
    if falta: sys.exit(f'{aba}: colunas ausentes {falta}')
    ix={ORIGEM[k]:cab.index(k) for k in ORIGEM}; k0=0; ruins=0
    for r in it:
        if r is None or all(x is None for x in r): continue
        if not isinstance(r[ix['data']], (datetime.datetime, datetime.date)): ruins+=1; continue   # linha desalinhada na planilha
        w.writerow([txt(r[ix[c]]) if ix[c] < len(r) else '' for c in COLS]); n+=1; k0+=1
    print(f'{aba}: {k0} linhas lidas, {ruins} descartadas (data inválida)')
buf.seek(0)
con=psycopg2.connect(open(os.path.expanduser('~/.config/novasp/prod-pooler.dsn')).read().strip(), connect_timeout=30); cur=con.cursor()
cur.execute("set statement_timeout=0")
cur.execute("create temp table tmp_itbi ("+', '.join(c+' text' for c in COLS)+") on commit drop")
cur.copy_expert("copy tmp_itbi from stdin with (format csv)", buf)
cur.execute("""
create temp table tmp_novo on commit drop as
select distinct on (s.sql, s.data, s.valor, coalesce(s.complemento,''), coalesce(s.matricula,'')) s.* from (
  select nullif(regexp_replace(sql,'\\D','','g'),'')::bigint sql, lpad(regexp_replace(sql,'\\D','','g'),11,'0') sql11,
         nullif(logradouro,'') logradouro, nullif(numero,'') numero, nullif(complemento,'') complemento, nullif(cep,'') cep, natureza,
         nullif(valor,'')::numeric valor, nullif(data,'')::date data, nullif(vvr,'')::numeric vvr, nullif(proporcao,'')::numeric proporcao,
         nullif(base_calculo,'')::numeric base_calculo, nullif(financiamento,'') financiamento, nullif(matricula,'') matricula,
         nullif(area_terreno,'')::numeric area_terreno, nullif(testada,'')::numeric testada, nullif(fracao,'')::numeric fracao,
         nullif(area_constr,'')::numeric area_constr, nullif(uso,'') uso, nullif(padrao,'')::numeric::smallint padrao,
         nullif(padrao_desc,'') padrao_desc, nullif(acc,'')::numeric::smallint acc
    from tmp_itbi where sql ~ '\\d' and nullif(valor,'') is not null and nullif(data,'') is not null) s
 where s.data >= '2025-01-01'   -- a tabela guarda de 2025 em diante
   and not exists (select 1 from aval_itbi i where i.sql=s.sql and i.data=s.data and i.valor=s.valor
                     and coalesce(i.complemento,'')=coalesce(s.complemento,'') and coalesce(i.matricula,'')=coalesce(s.matricula,''))""")
cur.execute("select count(*), min(data), max(data), count(*) filter (where uso ilike '%apart%'), to_char(min(data),'YYYY-MM') from tmp_novo"); print('novas (ainda não no banco):', cur.fetchone())
cur.execute("select to_char(data,'YYYY-MM'), count(*) from tmp_novo group by 1 order by 1"); print('por mês:', cur.fetchall())
cur.execute("""insert into aval_itbi (sql, setor, quadra, lote, logradouro, numero, complemento, cep, natureza, valor, data, vvr, proporcao, base_calculo,
                 financiamento, matricula, area_terreno, testada, fracao, area_constr, uso, padrao, padrao_desc, acc)
               select sql, substr(sql11,1,3), substr(sql11,4,3), substr(sql11,7,4), logradouro, numero, complemento, cep, natureza, valor, data, vvr,
                      proporcao, base_calculo, financiamento, matricula, area_terreno, testada, fracao, area_constr, uso, padrao, padrao_desc, acc
                 from tmp_novo on conflict on constraint aval_itbi_unico do nothing returning id""")
ids=[r[0] for r in cur.fetchall()]; print('inseridas:', len(ids))
cur.execute("select count(*), max(data) from aval_itbi"); print('aval_itbi agora:', cur.fetchone())
# zona e distrito por interseção espacial (quando a venda já tem posição; as sem posição recebem depois do posicionador)
cur.execute("update aval_itbi i set zona=z.zona from aval_zona z where i.id = any(%s) and i.zona is null and i.geom is not null and st_contains(z.geom, i.geom)", (ids,))
if gravar:
    lista=os.path.join(os.path.dirname(os.path.abspath(__file__)), f'itbi_carga_{datetime.date.today():%Y%m%d}_ids.csv')
    open(lista,'w').write('id\n'+''.join(f'{i}\n' for i in ids)); con.commit(); print('GRAVADO · ids em', lista, '(para desfazer: delete from aval_itbi where id in (...))')
else: con.rollback(); print('simulação: desfeito, nada gravado')
