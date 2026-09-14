-- Seed inicial dos 7 acordos da planilha "Acordos Extrajudicial.xlsx".
-- Rodar 1 vez. Idempotente: usa "on conflict do nothing" via UNIQUE (proprietario,inquilino).

insert into public.acordos_extrajudiciais
  (proprietario, inquilino, dia_pagamento, situacao, parcelas_pagas, parcelas_total, status)
values
  ('Luis Fabiano Facioli Francisco',         'Kethellyn Vieira Gomes',              6,  'Entregou as chaves e fez um acordo dos valores em aberto',           8,  20, 'ativo'),
  ('Maria Rosa Cabral',                      'Andreia Malheiros Pimentel',          10, 'Acordo ref. alugueis de Nov, Dez, Jan e Fev',                        3,  7,  'ativo'),
  ('Maria Rosa Cabral',                      'Elieze Henrique de Oliveira',         10, 'Acordo ref. alugueis de Dez, Jan e Fev',                             4,  7,  'ativo'),
  ('Fernando Assunção Silva',                'Daniela Fantini',                     15, 'Acordo ref. alugueis de Fev, Mar, Abril e Maio',                     1,  11, 'ativo'),
  ('Ercilia Tita Tanganelli Piotto',         'Felipe Garcia Canizares',             27, 'Acordo ref. alugueis de Nov, Dez, Jan, Fev e Março',                 4,  6,  'ativo'),
  ('Maria Seiko Komine Lima',                'Gabriela Ribeiro Dos Santos',         11, 'Acordo ref. alugueis de Fev, Março e Abril',                         1,  5,  'ativo'),
  ('Maria Antonia Urbano',                   'Kleber Fabriciano Cardoso dos Santos', 30, 'Acordo ref. alugueis de Nov, Dez e Janeiro',                         3,  10, 'ativo');
