-- Acesso de leitura às funções de consulta do IPTU (dado público do GeoSampa, sem dados pessoais).
-- A tabela continua fechada (RLS sem policy); o portal só lê pelas funções.
grant execute on function iptu_por_endereco(text, text, integer) to anon, authenticated;
grant execute on function iptu_por_sql(text) to anon, authenticated;
grant execute on function iptu_norm(text) to anon, authenticated;
