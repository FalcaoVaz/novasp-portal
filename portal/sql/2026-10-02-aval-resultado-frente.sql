-- aval_resultado ganha a frente do terreno (o formulário de casa/terreno passou a enviar; faltava a coluna → erro ao salvar).
alter table aval_resultado add column if not exists frente numeric;
notify pgrst, 'reload schema';
