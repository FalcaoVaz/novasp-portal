-- Zonas que existem em aval_zona mas não tinham parâmetro em aval_zona_param (aval_geo fazia JOIN e
-- devolvia "fora das camadas"): ZPI-1/ZPI-2 (industrial), ZDE-1/ZDE-2 (desenvolvimento econômico),
-- AC-1/AC-2 (centralidade), ZPDS (preservação e desenvolvimento sustentável). Valores da LPUOS 16.402/2016.
insert into aval_zona_param (zona, ca_basico, ca_maximo, gabarito_m, incorporavel, familia) values
  ('ZPI-1', 1.0, 1.5, 'livre', false, 'industrial'),
  ('ZPI-2', 1.0, 1.5, 'livre', false, 'industrial'),
  ('ZDE-1', 1.0, 2.0, 'livre', true,  'industrial'),
  ('ZDE-2', 1.0, 2.0, 'livre', true,  'industrial'),
  ('AC-1',  1.0, 2.0, '28',    true,  'centralidade'),
  ('AC-2',  1.0, 2.0, '28',    true,  'centralidade'),
  ('ZPDS',  0.1, 0.1, '10',    false, 'ambiental'),
  ('ZPDSr', 0.1, 0.1, '10',    false, 'ambiental')
on conflict (zona) do nothing;
select z.zona, count(*) from aval_zona z left join aval_zona_param p on p.zona=z.zona where p.zona is null group by 1;
-- ZEIS-5 (habitação de interesse social com mercado popular): CA máx 4 nos eixos / 2 fora; usa 2 como padrão conservador
insert into aval_zona_param (zona, ca_basico, ca_maximo, gabarito_m, incorporavel, familia) values ('ZEIS-5', 1.0, 2.0, 'livre', true, 'social') on conflict (zona) do nothing;
-- Após a recarga com 38.358 perímetros (01/10): variantes "a" (ambiental, mesmos CA) e outras
insert into aval_zona_param (zona, ca_basico, ca_maximo, gabarito_m, incorporavel, familia) values
  ('ZEUa',    1.0, 4.0, 'livre', true,  'eixo'),
  ('ZERa',    1.0, 1.0, '10',    false, 'residencial'),
  ('ZCORa',   1.0, 2.0, '15',    true,  'corredor'),
  ('ZC-ZEIS', 1.0, 2.0, '48',    true,  'centro'),
  ('ZEIS-4',  1.0, 1.0, '10',    false, 'social'),
  ('ZMIS',    1.0, 2.0, '28',    true,  'mista'),
  ('ZMISa',   1.0, 2.0, '28',    true,  'mista')
on conflict (zona) do nothing;
