-- ═══════════════════════════════════════════════════════════
-- SEED — Seleção de Imóveis ativos (jun/2026)
-- Fonte: planilha "Organização - Seleção .xlsx" (aba 7 — mais atual)
-- Todos entram como APROVADOS, ativos por 3 meses a partir de hoje.
-- ═══════════════════════════════════════════════════════════

-- Trigger pra calcular ativo_ate baseado em now() (em vez de hardcodar)
insert into public.vendas_selecao_imoveis
  (codigo, corretor, equipe, endereco, status, aprovado_em, ativo_ate)
values
  -- Águia
  ('MO18696', 'Barbosa',         'Aguia',   'R José Antônio Maver, 55',                'aprovado', now(), (current_date + interval '3 months')::date),
  ('MO17219', 'Dirce',           'Aguia',   'R Canário, 1007 - Und. 82',               'aprovado', now(), (current_date + interval '3 months')::date),
  ('MO15546', 'Dirce',           'Aguia',   'AV Jamaris, 543 - Und. 74',               'aprovado', now(), (current_date + interval '3 months')::date),
  ('MO18621', 'Domenica',        'Aguia',   'R Arminda, 79 - Und. 44',                 'aprovado', now(), (current_date + interval '3 months')::date),
  ('MO15313', 'Sandra',          'Aguia',   'Nicolau Sousa Queirós, 104 - Und. 101',   'aprovado', now(), (current_date + interval '3 months')::date),

  -- Chris (Christiane)
  ('JA44333', 'Leandrinni',      'Chris',   'R Samambaia, 180 - Und. 94',              'aprovado', now(), (current_date + interval '3 months')::date),
  ('JA41364', 'Leandrinni',      'Chris',   'R Dos Lírios, 240 - Und. 21',             'aprovado', now(), (current_date + interval '3 months')::date),
  ('JA44116', 'Luisa',           'Chris',   'Santo Irineu, 775 - Und. 43',             'aprovado', now(), (current_date + interval '3 months')::date),
  ('JA44606', 'Olympia',         'Chris',   'R Itapiru, 264 - Und. 83',                'aprovado', now(), (current_date + interval '3 months')::date),
  ('JA44482', 'Suely',           'Chris',   'R Carneiro da Cunha, 1266 - Und. 184',    'aprovado', now(), (current_date + interval '3 months')::date),

  -- Emilia
  ('BI51508', 'Elson',           'Emilia',  'Padre Jerônimo Vermin, 204 - Und. 7',     'aprovado', now(), (current_date + interval '3 months')::date),
  ('BI50954', 'Elson',           'Emilia',  'R Afonso Celso, 1000 - Und. 132',         'aprovado', now(), (current_date + interval '3 months')::date),
  ('BI51255', 'Heloisa',         'Emilia',  'R Abagiba, 940 - Und. 113',               'aprovado', now(), (current_date + interval '3 months')::date),
  ('BI50665', 'Heloisa',         'Emilia',  'Cônego José Norberto, 195 - Und. 62',     'aprovado', now(), (current_date + interval '3 months')::date),
  ('BI51829', 'Maria',           'Emilia',  'R Itapiru, 53 - Und. 73',                 'aprovado', now(), (current_date + interval '3 months')::date),
  ('BI49649', 'Noemi',           'Emilia',  'R Gabriele D''annunzio, 1380 - Und. 2',   'aprovado', now(), (current_date + interval '3 months')::date),
  ('BI50537', 'Maria',           'Emilia',  'R Professor Sousa Barros, 265 - Und. 203 - Bl. A', 'aprovado', now(), (current_date + interval '3 months')::date),

  -- Felippe
  ('BI51616', 'Gilmar',          'Felippe', 'R Itatiaia, 344 - Und. 21',               'aprovado', now(), (current_date + interval '3 months')::date),
  ('BI49586', 'Luzia e Claudio', 'Felippe', 'R Orissanga, 245 - Und. 102',             'aprovado', now(), (current_date + interval '3 months')::date),
  ('BI44071', 'Luzia e Claudio', 'Felippe', 'R Joaquim de Morais Novais, 54',          'aprovado', now(), (current_date + interval '3 months')::date),
  ('BI51310', 'Marcia',          'Felippe', 'AV Ramalho Ortigão, 70 - Und. 32',        'aprovado', now(), (current_date + interval '3 months')::date),
  ('BI51205', 'Naliati',         'Felippe', 'R José Homero Roxo, 121 - Und. 71',       'aprovado', now(), (current_date + interval '3 months')::date),
  ('BI46352', 'Wellington',      'Felippe', 'R Conde de Porto Alegre, 1270 - Und. 92', 'aprovado', now(), (current_date + interval '3 months')::date),

  -- Fênix
  ('MO18613', 'Betta',           'Fenix',   'R Raiz da Serra, 306',                    'aprovado', now(), (current_date + interval '3 months')::date),
  ('MO18034', 'Kali',            'Fenix',   'R Hideo Suguiyama, 271',                  'aprovado', now(), (current_date + interval '3 months')::date),
  ('MO18486', 'Lucila',          'Fenix',   'R Michigan, 1127 - Und. 7',               'aprovado', now(), (current_date + interval '3 months')::date),
  ('MO18769', 'Magali',          'Fenix',   'R Gomes de Carvalho, 62 - Und. 81',       'aprovado', now(), (current_date + interval '3 months')::date),
  ('MO18614', 'Rachel',          'Fenix',   'AV Macuco, 466 - Und. 102',               'aprovado', now(), (current_date + interval '3 months')::date)
;
